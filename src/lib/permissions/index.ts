import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import type { GlobalRole, ProjectRole } from "@/generated/prisma/enums";
import { ADMIN_ROLES, ForbiddenError, UnauthorizedError } from "@/lib/permissions/roles";

export { ForbiddenError, UnauthorizedError } from "@/lib/permissions/roles";

const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  MANAGER: 2,
  OWNER: 3,
};

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: GlobalRole;
}

/** Reads the authenticated session. Returns null when logged out — never throws. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

/** Throws UnauthorizedError when there is no logged-in user. Use at the top of every server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws ForbiddenError unless the platform-level role is ADMIN or SUPER_ADMIN. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!ADMIN_ROLES.includes(user.role)) throw new ForbiddenError();
  return user;
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new ForbiddenError();
  return user;
}

/**
 * Resolves a user's effective role on a project: platform ADMIN/SUPER_ADMIN
 * always get OWNER-equivalent access; otherwise it's their explicit
 * ProjectMember row. Returns null when the user has no access at all —
 * callers must treat null as "this project does not exist" (never leak
 * cross-project existence to unauthorized users).
 */
export async function getProjectRole(
  userId: string,
  projectId: string
): Promise<ProjectRole | null> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * Enforces project-level access control on the server. Always call this
 * inside server actions/route handlers before touching project-scoped data —
 * never rely on the client only hiding UI for unauthorized roles.
 *
 * Deliberately requires real project membership regardless of platform role:
 * ADMIN/SUPER_ADMIN get no bypass here. Their extra privileges apply only to
 * /admin (see requireAdmin/requireSuperAdmin and src/app/admin), which reads
 * data directly rather than through this function — the normal app must
 * never let an admin role act on another user's project.
 */
export async function requireProjectAccess(
  projectId: string,
  minRole: ProjectRole = "VIEWER"
): Promise<CurrentUser> {
  const user = await requireUser();

  const role = await getProjectRole(user.id, projectId);
  if (!role || PROJECT_ROLE_RANK[role] < PROJECT_ROLE_RANK[minRole]) {
    throw new ForbiddenError();
  }
  return user;
}

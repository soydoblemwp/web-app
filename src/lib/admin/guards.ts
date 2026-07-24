import { ForbiddenError } from "@/lib/permissions/roles";
import type { GlobalRole } from "@/generated/prisma/enums";

/**
 * Pure admin authorization rules, deliberately split out from
 * src/server/actions/admin.ts (which is Prisma/DB-bound) so they're
 * directly unit-testable without a database.
 */

export function assertNotSelf(actorId: string, targetId: string, message: string): void {
  if (actorId === targetId) throw new ForbiddenError(message);
}

/** ADMIN can never modify a SUPER_ADMIN account — only another SUPER_ADMIN can. */
export function assertCanModifyTarget(actorRole: GlobalRole, targetRole: GlobalRole): void {
  if (targetRole === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new ForbiddenError("Solo un SUPER_ADMIN puede modificar a otro SUPER_ADMIN.");
  }
}

/**
 * True when demoting/suspending/removing `targetRole` would leave the
 * platform with zero SUPER_ADMIN accounts. `remainingSuperAdminCount` must
 * be the count of *other* SUPER_ADMIN users (i.e. excluding the target).
 */
export function wouldRemoveLastSuperAdmin(targetRole: GlobalRole, remainingSuperAdminCount: number): boolean {
  return targetRole === "SUPER_ADMIN" && remainingSuperAdminCount <= 0;
}

export function assertNotLastSuperAdmin(targetRole: GlobalRole, remainingSuperAdminCount: number): void {
  if (wouldRemoveLastSuperAdmin(targetRole, remainingSuperAdminCount)) {
    throw new ForbiddenError("No puedes hacer esto: dejaría la plataforma sin ninguna cuenta SUPER_ADMIN.");
  }
}

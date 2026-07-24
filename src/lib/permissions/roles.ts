import type { GlobalRole } from "@/generated/prisma/enums";

/**
 * Pure, framework-free role logic — deliberately has no "server-only" guard
 * (unlike src/lib/permissions/index.ts) so it can be imported from Server
 * *and* Client Components alike, e.g. to decide whether to show the
 * "Administración" link in the header — and from plain Node test files,
 * which can't resolve the "server-only" package at all.
 */
export const ADMIN_ROLES: GlobalRole[] = ["ADMIN", "SUPER_ADMIN"];

export function isAdminRole(role: GlobalRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export class UnauthorizedError extends Error {
  constructor(message = "Debes iniciar sesión.") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permisos para realizar esta acción.") {
    super(message);
  }
}

import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/permissions/roles";
import {
  assertCanModifyTarget,
  assertNotLastSuperAdmin,
  assertNotSelf,
  wouldRemoveLastSuperAdmin,
} from "@/lib/admin/guards";

describe("assertNotSelf: an admin can never target their own account", () => {
  it("throws when actorId === targetId", () => {
    expect(() => assertNotSelf("u1", "u1", "no self")).toThrow(ForbiddenError);
  });

  it("does nothing when acting on a different user", () => {
    expect(() => assertNotSelf("u1", "u2", "no self")).not.toThrow();
  });
});

describe("assertCanModifyTarget: ADMIN can never modify a SUPER_ADMIN", () => {
  it("ADMIN acting on a SUPER_ADMIN target throws", () => {
    expect(() => assertCanModifyTarget("ADMIN", "SUPER_ADMIN")).toThrow(ForbiddenError);
  });

  it("SUPER_ADMIN acting on a SUPER_ADMIN target is allowed", () => {
    expect(() => assertCanModifyTarget("SUPER_ADMIN", "SUPER_ADMIN")).not.toThrow();
  });

  it("ADMIN acting on a regular USER is allowed", () => {
    expect(() => assertCanModifyTarget("ADMIN", "USER")).not.toThrow();
  });

  it("ADMIN acting on another ADMIN is allowed", () => {
    expect(() => assertCanModifyTarget("ADMIN", "ADMIN")).not.toThrow();
  });
});

describe("last-SUPER_ADMIN protection", () => {
  it("wouldRemoveLastSuperAdmin is true for the only remaining SUPER_ADMIN", () => {
    expect(wouldRemoveLastSuperAdmin("SUPER_ADMIN", 0)).toBe(true);
  });

  it("wouldRemoveLastSuperAdmin is false when other SUPER_ADMINs remain", () => {
    expect(wouldRemoveLastSuperAdmin("SUPER_ADMIN", 1)).toBe(false);
  });

  it("wouldRemoveLastSuperAdmin is false for non-SUPER_ADMIN targets regardless of count", () => {
    expect(wouldRemoveLastSuperAdmin("ADMIN", 0)).toBe(false);
    expect(wouldRemoveLastSuperAdmin("USER", 0)).toBe(false);
  });

  it("assertNotLastSuperAdmin throws only when it's the last SUPER_ADMIN", () => {
    expect(() => assertNotLastSuperAdmin("SUPER_ADMIN", 0)).toThrow(ForbiddenError);
    expect(() => assertNotLastSuperAdmin("SUPER_ADMIN", 2)).not.toThrow();
    expect(() => assertNotLastSuperAdmin("USER", 0)).not.toThrow();
  });
});

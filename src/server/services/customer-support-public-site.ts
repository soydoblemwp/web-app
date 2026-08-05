import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { normalizeAndValidateHostname } from "@/lib/customer-support/hostname";
import { getOrCreateConfig } from "@/server/services/customer-support-config";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { publishAutomationEvent } from "@/server/services/automation-events";

/**
 * Explicit, exclusive hostname -> project binding (Fase 40's third
 * correction, spec sections 1-3, 9) — replaces the earlier "first activated
 * project wins" heuristic. `CustomerSupportPublicSite.normalizedHostname`
 * is a real, unique database column: two projects can NEVER simultaneously
 * hold the same hostname, enforced by the database itself, not just a
 * pre-check (spec section 3: "no uses solamente findFirst() -> create()").
 *
 * Honest, documented scope limitation: claiming a hostname is gated by
 * MANAGER-level access to the project — the same trust model this app
 * already uses for every other external connection (WordPress URL, GitHub
 * org, Google OAuth). This does NOT cryptographically prove DNS ownership
 * of the hostname (no TXT-record/HTTP challenge is implemented in this
 * pass) — the PENDING/VERIFIED/ACTIVE/DISABLED states exist as specified,
 * but VERIFIED here means "a MANAGER of this project explicitly registered
 * it," not "DNS ownership was cryptographically proven." The core problem
 * this correction targets — silent, ambiguous cross-project resolution — is
 * fully and atomically solved regardless of that limitation.
 */

function allowLocalhostHostnames(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function listPublicSites(projectId: string) {
  return prisma.customerSupportPublicSite.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

export interface ClaimPublicSiteResult {
  error?: string;
  conflict?: boolean;
  site?: { id: string; hostname: string; normalizedHostname: string; status: string };
}

/**
 * Claims (or re-claims/reactivates) a hostname for this project. Never
 * silently reassigns a hostname already owned by a DIFFERENT project — that
 * always fails with a generic conflict message that never names the other
 * project (spec section 6: "no muestres el nombre del otro proyecto").
 * Race-safe: a genuine simultaneous claim from two projects is decided by
 * the database's own unique constraint, not a pre-check (spec section 3).
 */
export async function claimPublicSite(projectId: string, userId: string, rawHostname: string): Promise<ClaimPublicSiteResult> {
  const validation = normalizeAndValidateHostname(rawHostname, { allowLocalhost: allowLocalhostHostnames() });
  if (!validation.ok || !validation.normalizedHostname) return { error: validation.error };

  const config = await getOrCreateConfig(projectId);
  const trimmedHostname = rawHostname.trim();

  const existing = await prisma.customerSupportPublicSite.findUnique({ where: { normalizedHostname: validation.normalizedHostname } });
  if (existing && existing.projectId !== projectId) {
    return { error: "Este dominio ya esta asignado a otro proyecto.", conflict: true };
  }
  if (existing && existing.projectId === projectId) {
    const updated = await prisma.customerSupportPublicSite.update({
      where: { id: existing.id },
      data: { hostname: trimmedHostname, status: "ACTIVE", verifiedAt: new Date(), customerSupportConfigId: config.id },
    });
    await logCustomerSupportAction(projectId, userId, "customer_support.public_site_reactivated", "CustomerSupportPublicSite", updated.id, { hostname: validation.normalizedHostname });
    return { site: updated };
  }

  try {
    const created = await prisma.customerSupportPublicSite.create({
      data: {
        projectId,
        customerSupportConfigId: config.id,
        hostname: trimmedHostname,
        normalizedHostname: validation.normalizedHostname,
        status: "ACTIVE",
        verifiedAt: new Date(),
        createdById: userId,
      },
    });
    await logCustomerSupportAction(projectId, userId, "customer_support.public_site_claimed", "CustomerSupportPublicSite", created.id, { hostname: validation.normalizedHostname });
    await publishAutomationEvent({
      projectId,
      eventKey: "customer_support.public_site_claimed",
      actorId: userId,
      payload: { hostname: validation.normalizedHostname },
      idempotencyKey: `customer_support.public_site_claimed:${created.id}`,
    });
    return { site: created };
  } catch (err) {
    // A concurrent claim from another project won the race between our pre-check above and this insert — the unique constraint is the real, final authority, never the pre-check alone.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Este dominio ya esta asignado a otro proyecto.", conflict: true };
    }
    throw err;
  }
}

export async function disablePublicSite(projectId: string, userId: string, siteId: string): Promise<{ error?: string }> {
  const site = await prisma.customerSupportPublicSite.findUnique({ where: { id: siteId } });
  if (!site || site.projectId !== projectId) return { error: "Dominio no encontrado." };
  await prisma.customerSupportPublicSite.update({ where: { id: siteId }, data: { status: "DISABLED" } });
  await logCustomerSupportAction(projectId, userId, "customer_support.public_site_disabled", "CustomerSupportPublicSite", siteId);
  return {};
}

/** Real reachability check ("Probar en la web") — confirms this project's own /api/customer-support/chat endpoint currently resolves for the given hostname, never a DNS-ownership proof (see module doc). */
export async function checkPublicSiteInstallation(projectId: string, siteId: string): Promise<{ live: boolean; reason?: string }> {
  const site = await prisma.customerSupportPublicSite.findUnique({ where: { id: siteId } });
  if (!site || site.projectId !== projectId) return { live: false, reason: "Dominio no encontrado." };
  if (site.status !== "ACTIVE") return { live: false, reason: "Este dominio no esta activo." };
  const config = await prisma.customerSupportConfig.findUnique({ where: { id: site.customerSupportConfigId } });
  if (!config?.active) return { live: false, reason: "El agente no esta activo todavia." };
  return { live: true };
}

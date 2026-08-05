import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listGa4Properties, listSearchConsoleSites, GoogleApiError } from "@/lib/integrations/google-api-client";
import { getValidAccessToken } from "@/server/services/google-connection";
import { logIntegrationAction } from "@/server/services/google-audit";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";

/**
 * Live property/site discovery (spec sections 11-12) + persisted, real,
 * user-confirmed resource selection (spec: "guarda solamente las
 * propiedades confirmadas por el usuario", "revalida en servidor").
 */

export interface DiscoveredGa4Property {
  externalId: string;
  name: string;
  accountName: string;
}

export async function listLiveGa4Properties(projectId: string): Promise<DiscoveredGa4Property[] | { error: string }> {
  const token = await getValidAccessToken(projectId);
  if ("error" in token) return { error: token.error };
  try {
    const properties = await listGa4Properties(token.accessToken);
    return properties.map((p) => ({ externalId: p.property, name: p.displayName, accountName: p.accountName }));
  } catch (err) {
    return { error: err instanceof GoogleApiError ? err.message : "No se pudieron obtener las propiedades de Google Analytics 4." };
  }
}

export interface DiscoveredGscSite {
  externalId: string;
  name: string;
  permissionLevel: string;
}

export async function listLiveSearchConsoleSites(projectId: string): Promise<DiscoveredGscSite[] | { error: string }> {
  const token = await getValidAccessToken(projectId);
  if ("error" in token) return { error: token.error };
  try {
    const sites = await listSearchConsoleSites(token.accessToken);
    return sites.map((s) => ({ externalId: s.siteUrl, name: s.siteUrl, permissionLevel: s.permissionLevel }));
  } catch (err) {
    return { error: err instanceof GoogleApiError ? err.message : "No se pudieron obtener las propiedades de Search Console." };
  }
}

export async function listSavedResources(projectId: string) {
  return prisma.googleIntegrationResource.findMany({ where: { projectId }, orderBy: [{ type: "asc" }, { name: "asc" }] });
}

export interface SelectedResourceInput {
  type: "GA4_PROPERTY" | "SEARCH_CONSOLE_SITE";
  externalId: string;
  name: string;
  accountName?: string | null;
  permissionLevel?: string | null;
}

/**
 * Persists exactly the resources the user confirmed — never auto-selects.
 * Re-validates each one against the LIVE list from Google before saving
 * (spec section 11: "revalida en servidor que las propiedades sigan siendo
 * accesibles"), bounded by MAX_SELECTED_RESOURCES.
 */
export async function saveSelectedResources(projectId: string, userId: string, resources: SelectedResourceInput[]) {
  if (resources.length > GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES) {
    return { error: `No puedes seleccionar más de ${GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES} propiedades.` };
  }
  const connection = await prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
  if (!connection || connection.status === "DISCONNECTED") return { error: "No hay una conexión de Google activa." };

  const ga4 = resources.filter((r) => r.type === "GA4_PROPERTY");
  const gsc = resources.filter((r) => r.type === "SEARCH_CONSOLE_SITE");
  const [liveGa4, liveGsc] = await Promise.all([
    ga4.length > 0 ? listLiveGa4Properties(projectId) : Promise.resolve([]),
    gsc.length > 0 ? listLiveSearchConsoleSites(projectId) : Promise.resolve([]),
  ]);
  if ("error" in liveGa4) return { error: liveGa4.error };
  if ("error" in liveGsc) return { error: liveGsc.error };
  const liveGa4Ids = new Set(liveGa4.map((p) => p.externalId));
  const liveGscIds = new Set(liveGsc.map((s) => s.externalId));

  const invalid = resources.filter((r) => (r.type === "GA4_PROPERTY" ? !liveGa4Ids.has(r.externalId) : !liveGscIds.has(r.externalId)));
  if (invalid.length > 0) return { error: "Alguna propiedad seleccionada ya no es accesible con esta cuenta de Google — vuelve a cargar la lista." };

  const saved = await prisma.$transaction(
    resources.map((r) =>
      prisma.googleIntegrationResource.upsert({
        where: { connectionId_type_externalId: { connectionId: connection.id, type: r.type, externalId: r.externalId } },
        create: { connectionId: connection.id, projectId, type: r.type, externalId: r.externalId, name: r.name, accountName: r.accountName ?? null, permissionLevel: r.permissionLevel ?? null, active: true },
        update: { name: r.name, accountName: r.accountName ?? null, permissionLevel: r.permissionLevel ?? null, active: true },
      })
    )
  );

  await logIntegrationAction(projectId, userId, "integration.resources_selected", "GoogleIntegrationConnection", connection.id, { count: saved.length });
  for (const resource of saved) {
    await publishAutomationEvent({
      projectId,
      eventKey: "integration.resource_enabled",
      resourceId: resource.id,
      actorId: userId,
      payload: { provider: resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId: resource.id },
      idempotencyKey: `integration.resource_enabled:${resource.id}`,
    });
  }
  return { saved: saved.map((s) => s.id) };
}

export async function setResourceActive(projectId: string, userId: string, resourceId: string, active: boolean) {
  const resource = await prisma.googleIntegrationResource.findUnique({ where: { id: resourceId } });
  if (!resource || resource.projectId !== projectId) return { error: "Propiedad no encontrada." };
  await prisma.googleIntegrationResource.update({ where: { id: resourceId }, data: { active } });
  await logIntegrationAction(projectId, userId, active ? "integration.resource_enabled" : "integration.resource_disabled", "GoogleIntegrationResource", resourceId);
  await publishAutomationEvent({
    projectId,
    eventKey: active ? "integration.resource_enabled" : "integration.resource_disabled",
    resourceId,
    actorId: userId,
    payload: { provider: resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId },
    idempotencyKey: `${active ? "integration.resource_enabled" : "integration.resource_disabled"}:${resourceId}:${Date.now()}`,
  });
  return {};
}

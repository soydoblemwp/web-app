"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import {
  saveSelectedResourcesSchema,
  triggerManualSyncSchema,
  resyncRangeSchema,
  toggleResourceActiveSchema,
  setGooglePausedSchema,
  syncHistoryFilterSchema,
} from "@/lib/validation/google-integrations";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google-oauth";
import { getConnection, getConnectionById, testGoogleConnection, setGooglePaused, disconnectGoogle } from "@/server/services/google-connection";
import { listLiveGa4Properties, listLiveSearchConsoleSites, listSavedResources, saveSelectedResources, setResourceActive } from "@/server/services/google-resources";
import { triggerManualSync, resyncCustomRange, listSyncHistory, getSyncRunDetail, getGoogleProviderOverviews } from "@/server/services/google-sync";

/**
 * Server actions for the Google Integrations Hub (Fase 39 spec section 31)
 * — reads at EDITOR, connection/property/pause/disconnect changes at
 * MANAGER. Every action re-derives `projectId` from its own argument and
 * re-checks access on the server; nothing here trusts a hidden button.
 */

export async function getGoogleIntegrationStatusAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const [connection, resources] = await Promise.all([getConnection(projectId), listSavedResources(projectId)]);
  return { configured: isGoogleOAuthConfigured(), connection, resources };
}

export async function getGoogleProviderOverviewsAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  return getGoogleProviderOverviews(projectId);
}

export async function getGoogleConnectionDetailAction(projectId: string, connectionId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const connection = await getConnectionById(projectId, connectionId);
  if (!connection) return { error: "Conexión no encontrada." };
  return { connection };
}

export async function listLiveGa4PropertiesAction(projectId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  return listLiveGa4Properties(projectId);
}

export async function listLiveSearchConsoleSitesAction(projectId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  return listLiveSearchConsoleSites(projectId);
}

export async function saveSelectedGoogleResourcesAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = saveSelectedResourcesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const result = await saveSelectedResources(projectId, user.id, parsed.data.resources);
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  return result;
}

export async function setGoogleResourceActiveAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = toggleResourceActiveSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await setResourceActive(projectId, user.id, parsed.data.resourceId, parsed.data.active);
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  return result;
}

export async function testGoogleConnectionAction(projectId: string) {
  await requireProjectAccess(projectId, "MANAGER");
  return testGoogleConnection(projectId);
}

export async function setGooglePausedAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = setGooglePausedSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await setGooglePaused(projectId, user.id, parsed.data.paused);
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  return result;
}

export async function disconnectGoogleAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const result = await disconnectGoogle(projectId, user.id);
  revalidatePath(`/dashboard/${projectId}/integrations`);
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  return result;
}

/** Manual sync — EDITOR may trigger it for already-selected/active properties (spec section 31), never select/connect. */
export async function triggerManualGoogleSyncAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = triggerManualSyncSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const result = await triggerManualSync(projectId, user.id, parsed.data.resourceIds);
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  revalidatePath(`/dashboard/${projectId}/performance`);
  return result;
}

export async function resyncGoogleRangeAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "MANAGER");
  const parsed = resyncRangeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const result = await resyncCustomRange(projectId, user.id, parsed.data.resourceId, new Date(parsed.data.startDate), new Date(parsed.data.endDate));
  revalidatePath(`/dashboard/${projectId}/integrations/google`);
  revalidatePath(`/dashboard/${projectId}/performance`);
  return result;
}

export async function listGoogleSyncHistoryAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = syncHistoryFilterSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Filtro no válido." };
  return listSyncHistory(projectId, parsed.data);
}

export async function getGoogleSyncRunDetailAction(projectId: string, runId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const detail = await getSyncRunDetail(projectId, runId);
  if (!detail) return { error: "Ejecución no encontrada." };
  return { detail };
}

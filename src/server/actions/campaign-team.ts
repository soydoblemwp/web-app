"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { listProjectMembersForCampaignStudio, listCampaignTemplates } from "@/server/services/campaign-studio";

/** Read-only fetch for client components (assignee pickers, @mentions, "Equipo" tab) — reuses the existing ProjectMember model, never a second user/membership system. */
export async function listProjectMembersForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listProjectMembersForCampaignStudio(projectId);
}

export async function listCampaignTemplatesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listCampaignTemplates(projectId);
}

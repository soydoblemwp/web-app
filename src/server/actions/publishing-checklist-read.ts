"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { getChecklistTemplate } from "@/server/services/publishing";

/** Read-only fetch for the composer's checklist panel — resolves a project's custom override for a platform, or null (caller falls back to the built-in default). */
export async function getChecklistTemplateAction(projectId: string, platform: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getChecklistTemplate(projectId, platform);
}

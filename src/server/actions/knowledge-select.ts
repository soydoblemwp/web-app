"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { listCollectionsForSelect } from "@/server/services/knowledge-collections";
import { listSourcesForSelect } from "@/server/services/knowledge-sources";

export async function listCollectionsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listCollectionsForSelect(projectId);
}

export async function listSourcesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listSourcesForSelect(projectId);
}

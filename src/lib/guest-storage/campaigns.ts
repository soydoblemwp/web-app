import { getGuestDB } from "./db";
import type { LocalCampaign, LocalCampaignStatus } from "./types";

export interface SaveCampaignInput {
  projectId: string;
  name: string;
  description?: string;
  objective?: string;
  audience?: string;
  startDate?: string | null;
  endDate?: string | null;
  primaryCTA?: string;
  status?: LocalCampaignStatus;
}

export async function listCampaignsByProject(projectId: string): Promise<LocalCampaign[]> {
  const db = await getGuestDB();
  const campaigns = await db.getAllFromIndex("campaigns", "projectId", projectId);
  return campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createCampaign(input: SaveCampaignInput): Promise<LocalCampaign> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const campaign: LocalCampaign = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: input.name.trim().slice(0, 200) || "Campaña sin nombre",
    description: input.description?.trim() ?? "",
    objective: input.objective?.trim() ?? "",
    audience: input.audience?.trim() ?? "",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    primaryCTA: input.primaryCTA?.trim() ?? "",
    status: input.status ?? "DRAFT",
    createdAt: now,
    updatedAt: now,
  };
  await db.put("campaigns", campaign);
  return campaign;
}

export async function updateCampaign(
  id: string,
  patch: Partial<Omit<LocalCampaign, "id" | "projectId" | "createdAt">>
): Promise<LocalCampaign | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("campaigns", id);
  if (!existing) return undefined;
  const updated: LocalCampaign = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.put("campaigns", updated);
  return updated;
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getGuestDB();
  await db.delete("campaigns", id);
}

import { getGuestDB } from "./db";
import type { LocalBrandKit, LocalBrandTerm } from "./types";

export async function getLocalBrandKit(projectId: string): Promise<LocalBrandKit | undefined> {
  const db = await getGuestDB();
  return db.get("brandKits", projectId);
}

export interface SaveBrandKitInput {
  projectId: string;
  isActiveForAI?: boolean;
  name?: string;
  tagline?: string;
  tone?: string;
  personality?: string;
  valueProposition?: string;
  commonCTAs?: string;
  additionalNotes?: string;
  terms?: LocalBrandTerm[];
}

export async function saveLocalBrandKit(input: SaveBrandKitInput): Promise<LocalBrandKit> {
  const db = await getGuestDB();
  const existing = await db.get("brandKits", input.projectId);
  const brandKit: LocalBrandKit = {
    projectId: input.projectId,
    isActiveForAI: input.isActiveForAI ?? existing?.isActiveForAI ?? true,
    name: input.name?.trim() ?? existing?.name ?? "",
    tagline: input.tagline?.trim() ?? existing?.tagline ?? "",
    tone: input.tone?.trim() ?? existing?.tone ?? "",
    personality: input.personality?.trim() ?? existing?.personality ?? "",
    valueProposition: input.valueProposition?.trim() ?? existing?.valueProposition ?? "",
    commonCTAs: input.commonCTAs?.trim() ?? existing?.commonCTAs ?? "",
    additionalNotes: input.additionalNotes?.trim() ?? existing?.additionalNotes ?? "",
    terms: input.terms ?? existing?.terms ?? [],
    updatedAt: new Date().toISOString(),
  };
  await db.put("brandKits", brandKit);
  return brandKit;
}

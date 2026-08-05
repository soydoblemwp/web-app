import type { SocialPlatform } from "@/generated/prisma/enums";

export interface ChecklistItem {
  id: string;
  label: string;
}

/**
 * Built-in per-platform checklist — overridable per project via
 * PublishingChecklistTemplate.items (same shape). See
 * src/server/actions/publishing-checklists.ts for how an override is
 * resolved, and SocialPost.checklistState for where completion is stored.
 */
const DEFAULT_CHECKLISTS: Partial<Record<SocialPlatform, ChecklistItem[]>> = {
  INSTAGRAM: [
    { id: "text-reviewed", label: "Texto revisado" },
    { id: "cover", label: "Portada" },
    { id: "alt-text", label: "Texto alternativo" },
    { id: "hashtags", label: "Hashtags" },
    { id: "cta", label: "CTA" },
    { id: "location", label: "Ubicación" },
    { id: "format-correct", label: "Formato correcto" },
  ],
  YOUTUBE: [
    { id: "title", label: "Título" },
    { id: "description", label: "Descripción" },
    { id: "thumbnail", label: "Miniatura" },
    { id: "tags", label: "Etiquetas" },
    { id: "chapters", label: "Capítulos" },
    { id: "cta", label: "CTA" },
    { id: "subtitles", label: "Subtítulos" },
    { id: "category", label: "Categoría" },
  ],
  EMAIL: [
    { id: "subject", label: "Asunto" },
    { id: "preheader", label: "Preheader" },
    { id: "links", label: "Enlaces" },
    { id: "sender", label: "Remitente" },
    { id: "segmentation", label: "Segmentación" },
    { id: "test-send", label: "Prueba" },
    { id: "unsubscribe", label: "Baja voluntaria" },
  ],
};

const GENERIC_CHECKLIST: ChecklistItem[] = [
  { id: "text-reviewed", label: "Texto revisado" },
  { id: "cta", label: "CTA" },
  { id: "link-reviewed", label: "Enlace revisado" },
];

export function defaultChecklistForPlatform(platform: SocialPlatform): ChecklistItem[] {
  return DEFAULT_CHECKLISTS[platform] ?? GENERIC_CHECKLIST;
}

export function computeChecklistProgress(items: ChecklistItem[], state: Record<string, boolean> | null | undefined): number {
  if (items.length === 0) return 100;
  if (!state) return 0;
  const done = items.filter((item) => state[item.id] === true).length;
  return Math.round((done / items.length) * 100);
}

export function isChecklistComplete(items: ChecklistItem[], state: Record<string, boolean> | null | undefined): boolean {
  return computeChecklistProgress(items, state) === 100;
}

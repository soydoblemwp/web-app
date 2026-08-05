export interface PublishChecklistItem {
  id: string;
  label: string;
}

export const PUBLISH_CHECKLIST_ITEMS: PublishChecklistItem[] = [
  { id: "title-reviewed", label: "Título revisado" },
  { id: "content-reviewed", label: "Contenido revisado" },
  { id: "spelling-reviewed", label: "Ortografía revisada" },
  { id: "cta-included", label: "CTA incluido" },
  { id: "links-reviewed", label: "Enlaces revisados" },
  { id: "image-added", label: "Imagen añadida" },
  { id: "seo-completed", label: "SEO completado" },
  { id: "final-approval", label: "Aprobación final" },
];

/** Persisted shape of ContentItem.publishChecklist (a single Json column — see prisma/schema.prisma). */
export interface PublishPlan {
  checklist: Record<string, boolean>;
  assigneeName: string | null;
}

export const EMPTY_PUBLISH_PLAN: PublishPlan = { checklist: {}, assigneeName: null };

/** Never trusts the raw DB value's shape blindly — old/malformed JSON degrades to an empty plan instead of throwing. */
export function parsePublishPlan(value: unknown): PublishPlan {
  if (!value || typeof value !== "object") return EMPTY_PUBLISH_PLAN;
  const record = value as Record<string, unknown>;
  const checklist =
    record.checklist && typeof record.checklist === "object"
      ? Object.fromEntries(
          Object.entries(record.checklist as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")
        )
      : {};
  const assigneeName = typeof record.assigneeName === "string" ? record.assigneeName : null;
  return { checklist: checklist as Record<string, boolean>, assigneeName };
}

export function computeChecklistProgress(checklist: Record<string, boolean> | null | undefined): number {
  if (!checklist) return 0;
  const total = PUBLISH_CHECKLIST_ITEMS.length;
  if (total === 0) return 0;
  const done = PUBLISH_CHECKLIST_ITEMS.filter((item) => checklist[item.id] === true).length;
  return Math.round((done / total) * 100);
}

import type { BrandKit, BrandTerm, Project } from "@/generated/prisma/client";

/**
 * Renders the project + brand kit into a system-prompt block. Every AI
 * feature that should respect brand rules calls this instead of hand-rolling
 * its own summary, so "which fields count as brand context" stays in one place.
 */
export function buildBrandContext(
  project: Pick<Project, "name" | "primaryLanguage" | "tone" | "targetAudience" | "market">,
  brandKit: (BrandKit & { terms: BrandTerm[] }) | null
): string {
  const lines: string[] = [
    `Proyecto: ${project.name}`,
    `Idioma principal: ${project.primaryLanguage}`,
  ];
  if (project.targetAudience) lines.push(`Público objetivo del proyecto: ${project.targetAudience}`);
  if (project.market) lines.push(`Mercado: ${project.market}`);
  if (project.tone) lines.push(`Tono general del proyecto: ${project.tone}`);

  if (brandKit?.isActiveForAI) {
    if (brandKit.name) lines.push(`Nombre de marca: ${brandKit.name}`);
    if (brandKit.tagline) lines.push(`Eslogan: ${brandKit.tagline}`);
    if (brandKit.tone) lines.push(`Tono de marca: ${brandKit.tone}`);
    if (brandKit.personality) lines.push(`Personalidad de marca: ${brandKit.personality}`);
    if (brandKit.valueProposition) lines.push(`Propuesta de valor: ${brandKit.valueProposition}`);
    if (brandKit.commonCTAs) lines.push(`CTA habituales: ${brandKit.commonCTAs}`);
    if (brandKit.additionalNotes) lines.push(`Instrucciones adicionales: ${brandKit.additionalNotes}`);

    const forbidden = brandKit.terms.filter((t) => t.isForbidden).map((t) => t.term);
    const preferred = brandKit.terms.filter((t) => !t.isForbidden).map((t) => t.term);
    if (preferred.length) lines.push(`Palabras preferidas: ${preferred.join(", ")}`);
    if (forbidden.length) lines.push(`Palabras PROHIBIDAS (no usar bajo ninguna circunstancia): ${forbidden.join(", ")}`);
  }

  return lines.join("\n");
}

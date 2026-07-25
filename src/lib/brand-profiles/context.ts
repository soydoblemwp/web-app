import type { BrandProfileLike } from "@/lib/brand-profiles/types";

/**
 * Renders a BrandProfile into a system-prompt block — the multi-profile
 * equivalent of src/lib/ai/brand-context.ts's buildBrandContext, but for a
 * user-owned, reusable brand identity instead of the single per-project
 * BrandKit. Every integration point (AI Center tool generation, Chat IA,
 * Prompt Library's "Usar Brand Kit") calls this one function — never a
 * bespoke summary of its own.
 */
export function buildBrandProfileContext(profile: BrandProfileLike): string {
  const lines: string[] = [`Marca activa: ${profile.name}`];

  if (profile.description) lines.push(`Descripción: ${profile.description}`);
  if (profile.mission) lines.push(`Misión: ${profile.mission}`);
  if (profile.vision) lines.push(`Visión: ${profile.vision}`);
  if (profile.values.length) lines.push(`Valores: ${profile.values.join(", ")}`);
  if (profile.targetAudience) lines.push(`Público objetivo: ${profile.targetAudience}`);
  if (profile.tone) lines.push(`Tono de comunicación: ${profile.tone}`);
  if (profile.personality) lines.push(`Personalidad de marca: ${profile.personality}`);
  if (profile.primaryLanguage) lines.push(`Idioma principal: ${profile.primaryLanguage}`);
  if (profile.country) lines.push(`País: ${profile.country}`);
  if (profile.writingStyle) lines.push(`Estilo de escritura: ${profile.writingStyle}`);
  if (profile.preferredCTAs.length) lines.push(`CTA preferidos: ${profile.preferredCTAs.join(", ")}`);
  if (profile.allowedWords.length) lines.push(`Palabras preferidas: ${profile.allowedWords.join(", ")}`);
  if (profile.forbiddenWords.length)
    lines.push(`Palabras PROHIBIDAS (no usar bajo ninguna circunstancia): ${profile.forbiddenWords.join(", ")}`);
  if (profile.website) lines.push(`Sitio web: ${profile.website}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.socialLinks.length) lines.push(`Redes sociales: ${profile.socialLinks.join(", ")}`);
  if (profile.colors.length) lines.push(`Colores de marca: ${profile.colors.join(", ")}`);
  if (profile.typography) lines.push(`Tipografía: ${profile.typography}`);

  return lines.join("\n");
}

/**
 * Maps a BrandProfile to the documented {{brand_*}} template variables — the
 * bridge between Brand Kit and AI Templates' render engine
 * (src/lib/ai-templates/engine.ts). Only non-empty fields are included, so a
 * template's own {{brand_x}} stays correctly reported as "missing" (not
 * silently blank) when the active profile doesn't have that field set.
 */
export function buildBrandProfileTemplateVariables(profile: BrandProfileLike): Record<string, string> {
  const variables: Record<string, string> = { brand_name: profile.name };

  const optional: Record<string, string | null> = {
    brand_description: profile.description,
    brand_mission: profile.mission,
    brand_vision: profile.vision,
    brand_audience: profile.targetAudience,
    brand_tone: profile.tone,
    brand_personality: profile.personality,
    brand_language: profile.primaryLanguage,
    brand_country: profile.country,
    brand_writing_style: profile.writingStyle,
    brand_website: profile.website,
    brand_email: profile.email,
    brand_typography: profile.typography,
    brand_logo: profile.logoUrl,
    brand_notes: profile.internalNotes,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) variables[key] = value;
  }

  const arrays: Record<string, string[]> = {
    brand_values: profile.values,
    brand_allowed_words: profile.allowedWords,
    brand_forbidden_words: profile.forbiddenWords,
    brand_cta: profile.preferredCTAs,
    brand_social: profile.socialLinks,
    brand_colors: profile.colors,
  };
  for (const [key, list] of Object.entries(arrays)) {
    if (list.length) variables[key] = list.join(", ");
  }

  return variables;
}

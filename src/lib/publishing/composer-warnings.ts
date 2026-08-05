import { PLATFORM_SPECS } from "@/lib/publishing/platform-specs";
import type { SocialPlatform } from "@/generated/prisma/enums";

export interface ComposerWarningInput {
  platform: SocialPlatform;
  text: string;
  hashtags: string[];
  cta: string;
  link: string;
  mediaCount: number;
  altTextCount: number;
}

export interface ComposerWarning {
  id: string;
  message: string;
}

function isLikelyValidUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pure, deterministic — every warning here is advisory (spec section 4:
 * "Debe mostrar advertencias, no bloqueos arbitrarios"). Nothing in this
 * function ever prevents saving/scheduling; callers decide what to do with
 * the list.
 */
export function computeComposerWarnings(input: ComposerWarningInput): ComposerWarning[] {
  const spec = PLATFORM_SPECS[input.platform];
  const warnings: ComposerWarning[] = [];

  if (spec && input.text.length > spec.recommendedTextLength) {
    warnings.push({
      id: "text-too-long",
      message: `El texto supera lo recomendado para ${spec.label} (${input.text.length}/${spec.recommendedTextLength} caracteres).`,
    });
  }

  if (spec?.requiresMedia && input.mediaCount === 0) {
    warnings.push({ id: "missing-media", message: `${spec.label} recomienda incluir al menos un medio.` });
  }

  if (!input.cta.trim()) {
    warnings.push({ id: "missing-cta", message: "No has definido una llamada a la acción (CTA)." });
  }

  if (spec && spec.recommendedHashtags > 0 && input.hashtags.length === 0) {
    warnings.push({ id: "missing-hashtags", message: `${spec.label} suele beneficiarse de hashtags y no tiene ninguno.` });
  }

  if (input.mediaCount > 0 && input.altTextCount < input.mediaCount) {
    warnings.push({ id: "missing-alt-text", message: "Hay medios sin texto alternativo — afecta la accesibilidad." });
  }

  if (input.link.trim() && !isLikelyValidUrl(input.link)) {
    warnings.push({ id: "broken-link", message: "El enlace no parece una URL válida." });
  }

  return warnings;
}

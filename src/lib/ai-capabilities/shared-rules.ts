/**
 * Shared guardrail sentences reused by every text-capability prompt in this
 * app — extracted from what used to be locally-duplicated constants inside
 * `src/lib/ai-center/tools/document-ai-prompts.ts` and
 * `src/lib/ai-center/tools/blog-seo-prompts.ts` (Fase 41 correction: "no
 * dupliques la lógica, reutilízala"). Both AI Center's prompt files and the
 * public /herramientas prompt cores under `src/lib/ai-capabilities/*` import
 * from here — there is exactly one copy of this wording in the codebase.
 */

export const NO_INVENTED_CONTENT_RULE =
  "Trabaja únicamente con el texto que te proporcione el usuario. No inventes datos, cifras, nombres, fechas, cláusulas ni hechos que no estén en el documento original. Si falta contexto necesario para completar la tarea con precisión, indícalo claramente en tu respuesta en lugar de suponerlo.";

export const PRESERVE_KEY_DATA_RULE =
  "No alteres datos importantes del documento original (cifras, fechas, nombres propios, cantidades, condiciones, cláusulas) — consérvalos exactamente como aparecen en el texto proporcionado.";

export const TEXT_ONLY_NOTE =
  "Solo trabajas con el texto que el usuario pega directamente en el formulario — no tienes acceso a archivos PDF, Word, Google Docs ni a ningún sistema externo, y no realizas reconocimiento óptico de caracteres (OCR).";

export const NO_REAL_METRICS_RULE =
  "No tienes acceso a Google Search Console, herramientas de keywords ni analítica real. Nunca inventes volumen de búsqueda, dificultad de palabra clave, posición en Google ni tráfico orgánico como si fueran datos reales — si esa información sería útil, dilo explícitamente y trabaja solo con lo que el usuario te proporciona.";

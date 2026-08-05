export type EngagementPlatform = "instagram" | "tiktok" | "facebook" | "youtube" | "linkedin" | "x";

export const ENGAGEMENT_PLATFORMS: { id: EngagementPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
];

export type EngagementMethod = "followers" | "reach" | "impressions" | "views";

export const ENGAGEMENT_METHODS: { id: EngagementMethod; label: string; denominatorLabel: string }[] = [
  { id: "followers", label: "Por seguidores", denominatorLabel: "seguidores" },
  { id: "reach", label: "Por alcance", denominatorLabel: "alcance" },
  { id: "impressions", label: "Por impresiones", denominatorLabel: "impresiones" },
  { id: "views", label: "Por visualizaciones", denominatorLabel: "visualizaciones" },
];

export interface EngagementInputs {
  followers?: number;
  reach?: number;
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
}

export interface EngagementResult {
  ok: boolean;
  error?: string;
  ratePercent?: number;
  formula?: string;
  engagementActions?: number;
  denominator?: number;
}

const METHOD_DENOMINATOR_FIELD: Record<EngagementMethod, keyof EngagementInputs> = {
  followers: "followers",
  reach: "reach",
  impressions: "impressions",
  views: "views",
};

function sumEngagementActions(inputs: EngagementInputs): number {
  return (inputs.likes ?? 0) + (inputs.comments ?? 0) + (inputs.shares ?? 0) + (inputs.saves ?? 0) + (inputs.clicks ?? 0);
}

/**
 * Pure, deterministic engagement-rate calculation. Never classifies the
 * result as "good" or "bad" against an invented universal table — spec
 * section 6 explicitly forbids that; any interpretation the UI shows is
 * generic reference text, clearly labeled as such, never derived here.
 */
export function calculateEngagement(method: EngagementMethod, inputs: EngagementInputs): EngagementResult {
  const numericFields = Object.entries(inputs) as [string, number | undefined][];
  for (const [key, value] of numericFields) {
    if (value === undefined) continue;
    if (!Number.isFinite(value)) return { ok: false, error: `El valor de "${key}" no es un número válido.` };
    if (value < 0) return { ok: false, error: `El valor de "${key}" no puede ser negativo.` };
  }

  const denominatorField = METHOD_DENOMINATOR_FIELD[method];
  const denominator = inputs[denominatorField] ?? 0;
  if (denominator === 0) {
    return { ok: false, error: `Introduce un valor mayor que cero para "${denominatorField}" antes de calcular.` };
  }

  const engagementActions = sumEngagementActions(inputs);
  const ratePercent = (engagementActions / denominator) * 100;
  const methodMeta = ENGAGEMENT_METHODS.find((m) => m.id === method)!;

  return {
    ok: true,
    ratePercent,
    engagementActions,
    denominator,
    formula: `(likes + comentarios + compartidos + guardados + clics) ÷ ${methodMeta.denominatorLabel} × 100`,
  };
}

export const ENGAGEMENT_METHOD_EXPLANATION =
  "Por seguidores mide la interacción relativa a toda tu audiencia. Por alcance mide la interacción entre las personas que realmente vieron la publicación (normalmente más alto que por seguidores). Por impresiones mide la interacción por cada vez que se mostró el contenido, incluyendo visualizaciones repetidas. Por visualizaciones es la más adecuada para vídeo (TikTok, Reels, YouTube), ya que compara la interacción con el número real de reproducciones.";

export const ENGAGEMENT_REFERENCE_NOTE =
  "Como referencia general (no una regla universal): la tasa de engagement varía mucho según la plataforma, el formato de contenido, el tamaño de la audiencia y el nicho. No existe un umbral fijo que determine si una cifra es \"buena\" o \"mala\" — compárala con tu propio historial y con cuentas similares en tu mismo nicho.";

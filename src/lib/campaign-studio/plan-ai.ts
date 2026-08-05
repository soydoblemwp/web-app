/**
 * AI content-plan generation — same useLocalAI() engine, marker-delimited
 * text output (one block per piece), parsed by a pure/deterministic function.
 * See strategy-ai.ts for why this project prefers delimited text over strict
 * JSON for small local models.
 */
export interface CampaignPlanInput {
  campaignName: string;
  objective: string;
  audience: string;
  channels: string[];
  pillarNames: string[];
  contentCount: number;
  startDate: string;
  endDate: string;
}

export interface GeneratedPieceDraft {
  title: string;
  idea: string;
  platform: string;
  format: string;
  pillarName: string;
  objective: string;
  cta: string;
  date: string;
  time: string;
  keywords: string[];
  notes: string;
}

export function buildCampaignPlanSystemPrompt(brandContext: string): string {
  return [
    "Eres el planificador de contenido de campañas de AI Content Hub.",
    "Genera un plan de piezas de contenido para la campaña descrita, distribuidas de forma realista entre las fechas y canales indicados.",
    "Responde ÚNICAMENTE con bloques en este formato exacto, uno por pieza, sin texto adicional antes o después:",
    "---PIEZA---",
    "TITULO: <título interno breve>",
    "IDEA: <una frase describiendo la idea>",
    "PLATAFORMA: <uno de los canales indicados>",
    "FORMATO: <formato, ej. reel, post, carrusel, artículo, email>",
    "PILAR: <nombre exacto de un pilar indicado, o vacío si no aplica>",
    "OBJETIVO: <objetivo breve de esta pieza>",
    "CTA: <llamada a la acción>",
    "FECHA: <YYYY-MM-DD dentro del rango de la campaña>",
    "HORA: <HH:MM>",
    "PALABRAS_CLAVE: <lista separada por comas>",
    "NOTAS: <notas breves, opcional>",
    "---FIN---",
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCampaignPlanUserPrompt(input: CampaignPlanInput): string {
  return [
    `Campaña: ${input.campaignName}`,
    input.objective ? `Objetivo: ${input.objective}` : "",
    input.audience ? `Audiencia: ${input.audience}` : "",
    `Canales: ${input.channels.join(", ") || "sin especificar"}`,
    input.pillarNames.length ? `Pilares de contenido: ${input.pillarNames.join(", ")}` : "",
    `Genera exactamente ${input.contentCount} piezas.`,
    `Rango de fechas: ${input.startDate} a ${input.endDate}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseKeyValueBlock(block: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^([A-ZÁÉÍÓÚÑ_]+):\s*(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

/** Pure, deterministic — malformed blocks (missing título/plataforma) are silently dropped rather than crashing the caller. */
export function parseCampaignPlanText(raw: string): GeneratedPieceDraft[] {
  const blocks = raw.split("---PIEZA---").slice(1);
  const drafts: GeneratedPieceDraft[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split("---FIN---")[0] ?? rawBlock;
    const values = parseKeyValueBlock(block);
    if (!values.TITULO || !values.PLATAFORMA) continue;

    drafts.push({
      title: values.TITULO,
      idea: values.IDEA ?? "",
      platform: values.PLATAFORMA.toLowerCase(),
      format: values.FORMATO ?? "",
      pillarName: values.PILAR ?? "",
      objective: values.OBJETIVO ?? "",
      cta: values.CTA ?? "",
      date: values.FECHA ?? "",
      time: values.HORA ?? "",
      keywords: values.PALABRAS_CLAVE ? values.PALABRAS_CLAVE.split(",").map((k) => k.trim()).filter(Boolean) : [],
      notes: values.NOTAS ?? "",
    });
  }

  return drafts;
}

import { parseKeyValueBlock } from "@/lib/campaign-studio/plan-ai";

export interface CampaignPillarGenerationInput {
  campaignName: string;
  objective: string;
  audience: string;
  channels: string[];
  /** How many pillars to generate; omit/1 when regenerating a single existing pillar. */
  count: number;
}

export interface GeneratedPillarDraft {
  name: string;
  description: string;
  objective: string;
  percentage: number | null;
  formats: string[];
  platforms: string[];
  topics: string[];
}

export function buildCampaignPillarSystemPrompt(brandContext: string): string {
  return [
    "Eres el estratega de contenido de AI Content Hub.",
    "Genera pilares de contenido (temas recurrentes que estructuran la campaña) para la campaña descrita.",
    "Los porcentajes de todos los pilares generados deben sumar aproximadamente 100.",
    "Responde ÚNICAMENTE con bloques en este formato exacto, uno por pilar, sin texto adicional:",
    "---PILAR---",
    "NOMBRE: <nombre corto>",
    "DESCRIPCION: <una frase>",
    "OBJETIVO: <objetivo breve>",
    "PORCENTAJE: <número entero>",
    "FORMATOS: <lista separada por comas>",
    "PLATAFORMAS: <lista separada por comas>",
    "TEMAS: <lista separada por comas>",
    "---FIN---",
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCampaignPillarUserPrompt(input: CampaignPillarGenerationInput): string {
  return [
    `Campaña: ${input.campaignName}`,
    input.objective ? `Objetivo: ${input.objective}` : "",
    input.audience ? `Audiencia: ${input.audience}` : "",
    input.channels.length ? `Canales: ${input.channels.join(", ")}` : "",
    `Genera exactamente ${input.count} pilar(es).`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pure, deterministic — malformed blocks (missing nombre) are silently dropped. */
export function parseCampaignPillarsText(raw: string): GeneratedPillarDraft[] {
  const blocks = raw.split("---PILAR---").slice(1);
  const drafts: GeneratedPillarDraft[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split("---FIN---")[0] ?? rawBlock;
    const values = parseKeyValueBlock(block);
    if (!values.NOMBRE) continue;

    const percentage = values.PORCENTAJE ? Number.parseInt(values.PORCENTAJE, 10) : NaN;

    drafts.push({
      name: values.NOMBRE,
      description: values.DESCRIPCION ?? "",
      objective: values.OBJETIVO ?? "",
      percentage: Number.isFinite(percentage) ? percentage : null,
      formats: values.FORMATOS ? values.FORMATOS.split(",").map((f) => f.trim()).filter(Boolean) : [],
      platforms: values.PLATAFORMAS ? values.PLATAFORMAS.split(",").map((p) => p.trim()).filter(Boolean) : [],
      topics: values.TEMAS ? values.TEMAS.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
  }

  return drafts;
}

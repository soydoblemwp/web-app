/**
 * AI strategy generation for a campaign — one combined useLocalAI() call
 * (never a new AI engine) that asks for every structured section in a single
 * pass, using plain marker-delimited text (small local models are far more
 * reliable at this than strict JSON). parseCampaignStrategyText is a pure,
 * deterministic parser — never AI — so a flaky/partial model response
 * degrades to missing fields instead of throwing.
 */
export interface CampaignStrategyInput {
  name: string;
  description: string;
  productOrService: string;
  objective: string;
  audience: string;
  valueProposition: string;
  mainMessage: string;
  offer: string;
  tone: string;
  channels: string[];
}

export interface ParsedCampaignStrategy {
  summary: string;
  audienceProfile: string;
  valueProposition: string;
  mainMessage: string;
  objectives: string[];
  themes: string[];
  creativeAngles: string[];
  cta: string;
  risks: string[];
  recommendations: string[];
  suggestedMetrics: string[];
}

const SECTION_MARKERS: { marker: string; field: keyof ParsedCampaignStrategy; list: boolean }[] = [
  { marker: "RESUMEN", field: "summary", list: false },
  { marker: "AUDIENCIA", field: "audienceProfile", list: false },
  { marker: "PROPUESTA_VALOR", field: "valueProposition", list: false },
  { marker: "MENSAJE_PRINCIPAL", field: "mainMessage", list: false },
  { marker: "OBJETIVOS", field: "objectives", list: true },
  { marker: "TEMAS", field: "themes", list: true },
  { marker: "ANGULOS", field: "creativeAngles", list: true },
  { marker: "CTA", field: "cta", list: false },
  { marker: "RIESGOS", field: "risks", list: true },
  { marker: "RECOMENDACIONES", field: "recommendations", list: true },
  { marker: "METRICAS", field: "suggestedMetrics", list: true },
];

export function buildCampaignStrategySystemPrompt(brandContext: string, onlySections?: string[]): string {
  const wanted = onlySections?.length ? SECTION_MARKERS.filter((s) => onlySections.includes(s.field)) : SECTION_MARKERS;
  const format = wanted
    .map((s) => `${s.marker}:\n${s.list ? "<un elemento por línea, sin viñetas ni numeración>" : "<texto>"}`)
    .join("\n");

  return [
    "Eres el estratega de campañas de AI Content Hub.",
    "Genera una estrategia de marketing completa y accionable para la campaña descrita por el usuario.",
    "Responde ÚNICAMENTE en este formato exacto, con cada marcador en su propia línea seguido de dos puntos, sin texto adicional antes o después:",
    format,
    "No repitas los marcadores. No añadas explicaciones fuera de este formato.",
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildCampaignStrategyUserPrompt(input: CampaignStrategyInput): string {
  return [
    `Campaña: ${input.name}`,
    input.description ? `Descripción: ${input.description}` : "",
    input.productOrService ? `Producto/servicio: ${input.productOrService}` : "",
    input.objective ? `Objetivo principal: ${input.objective}` : "",
    input.audience ? `Público objetivo: ${input.audience}` : "",
    input.valueProposition ? `Propuesta de valor (borrador): ${input.valueProposition}` : "",
    input.mainMessage ? `Mensaje principal (borrador): ${input.mainMessage}` : "",
    input.offer ? `Oferta: ${input.offer}` : "",
    input.tone ? `Tono: ${input.tone}` : "",
    input.channels.length ? `Canales: ${input.channels.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractSection(raw: string, marker: string): string | null {
  const pattern = new RegExp(`^${marker}:\\s*$`, "m");
  const match = pattern.exec(raw);
  if (!match) return null;

  const start = match.index + match[0].length;
  const rest = raw.slice(start);
  const nextMarkerPattern = /^[A-ZÁÉÍÓÚÑ_]+:\s*$/m;
  const nextMatch = nextMarkerPattern.exec(rest);
  const sectionText = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return sectionText.trim();
}

function toListItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/** Pure, deterministic — never throws on malformed/partial AI output; missing sections just come back empty. */
export function parseCampaignStrategyText(raw: string): ParsedCampaignStrategy {
  const result: ParsedCampaignStrategy = {
    summary: "",
    audienceProfile: "",
    valueProposition: "",
    mainMessage: "",
    objectives: [],
    themes: [],
    creativeAngles: [],
    cta: "",
    risks: [],
    recommendations: [],
    suggestedMetrics: [],
  };

  for (const { marker, field, list } of SECTION_MARKERS) {
    const section = extractSection(raw, marker);
    if (section === null) continue;
    if (list) {
      (result[field] as string[]) = toListItems(section);
    } else {
      (result[field] as string) = section.trim();
    }
  }

  return result;
}

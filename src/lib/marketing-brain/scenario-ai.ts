/**
 * Strategy + scenario generation from a frozen Performance Center context
 * (Fase 35 spec sections 9-10) — ONE combined useLocalAI() call (never a
 * second AI client), same marker-delimited plain-text convention as
 * src/lib/campaign-studio/strategy-ai.ts (small local models are far more
 * reliable at this than strict JSON). parseScenarioGenerationText is pure
 * and deterministic — never AI — so a flaky/partial response degrades to
 * missing fields/fewer scenarios instead of throwing.
 *
 * The prompt explicitly forbids invented numeric outcomes (spec section 9):
 * no fabricated %, revenue, ROI, budget, or audience size unless it came
 * directly from a real goal/benchmark/budget already present in the context.
 */

export interface ScenarioGenerationContextInput {
  campaignOrProjectName: string;
  objective: string;
  periodLabel: string;
  dataQualityLevel: string;
  evidenceStrength: string;
  factsSummary: string[];
  derivedSummary: string[];
  signalsSummary: string[];
  hypothesesSummary: string[];
  constraintsSummary: string[];
  missingDataSummary: string[];
  hasBudget: boolean;
  budgetLabel: string | null;
}

export interface ParsedStrategyBrief {
  executiveSummary: string;
  observedSituation: string;
  dataBackedFindings: string[];
  dataLimitations: string[];
  objectives: string[];
  opportunities: string[];
  risks: string[];
  hypotheses: string[];
  recommendedStrategy: string;
  channels: string[];
  kpis: string[];
  successSignals: string[];
  deteriorationSignals: string[];
  measurementPlan: string;
  reviewConditions: string[];
}

export interface ParsedScenarioAction {
  title: string;
  description: string;
  channel: string;
}

export interface ParsedScenario {
  kind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE";
  objective: string;
  intensity: string;
  actions: ParsedScenarioAction[];
  resourcesRequired: string[];
  risks: string[];
  kpis: string[];
  preconditions: string[];
  constraints: string[];
  timeframe: string;
  measurementMethod: string;
}

export interface ParsedScenarioGeneration {
  brief: ParsedStrategyBrief;
  scenarios: ParsedScenario[];
}

const SCENARIO_LABELS: Record<ParsedScenario["kind"], string> = {
  CONSERVATIVE: "CONSERVADOR",
  BALANCED: "EQUILIBRADO",
  EXPANSIVE: "EXPANSIVO",
};
const SCENARIO_KINDS: ParsedScenario["kind"][] = ["CONSERVATIVE", "BALANCED", "EXPANSIVE"];

const BRIEF_MARKERS: { marker: string; field: keyof ParsedStrategyBrief; list: boolean }[] = [
  { marker: "RESUMEN_EJECUTIVO", field: "executiveSummary", list: false },
  { marker: "SITUACION_OBSERVADA", field: "observedSituation", list: false },
  { marker: "HALLAZGOS", field: "dataBackedFindings", list: true },
  { marker: "LIMITACIONES", field: "dataLimitations", list: true },
  { marker: "OBJETIVOS", field: "objectives", list: true },
  { marker: "OPORTUNIDADES", field: "opportunities", list: true },
  { marker: "RIESGOS", field: "risks", list: true },
  { marker: "HIPOTESIS", field: "hypotheses", list: true },
  { marker: "ESTRATEGIA_RECOMENDADA", field: "recommendedStrategy", list: false },
  { marker: "CANALES", field: "channels", list: true },
  { marker: "KPIS", field: "kpis", list: true },
  { marker: "SENALES_EXITO", field: "successSignals", list: true },
  { marker: "SENALES_DETERIORO", field: "deteriorationSignals", list: true },
  { marker: "PLAN_MEDICION", field: "measurementPlan", list: false },
  { marker: "CONDICIONES_REVISION", field: "reviewConditions", list: true },
];

function scenarioMarker(kind: ParsedScenario["kind"], suffix: string): string {
  return `ESCENARIO_${SCENARIO_LABELS[kind]}_${suffix}`;
}

/** `includeScenarios: false` (spec Fase 36 section 6.1 "Analizar rendimiento") asks only for the brief markers — used when the caller explicitly wants an analysis, never a full strategy with scenarios. */
export function buildScenarioGenerationSystemPrompt(includeScenarios = true): string {
  const briefFormat = BRIEF_MARKERS.map((m) => `${m.marker}:\n${m.list ? "<un elemento por línea, sin viñetas ni numeración>" : "<texto>"}`).join("\n");
  if (!includeScenarios) {
    return [
      "Eres el estratega de Marketing Brain de AI Content Hub, analizando datos reales de rendimiento — el usuario solo pidió un ANÁLISIS, no una estrategia ni escenarios.",
      "Reglas obligatorias:",
      "- Nunca inventes cifras de conversión, ingresos, ROI, coste, presupuesto o tamaño de audiencia. Si el contexto no incluye un número real, usa palabras direccionales: aumentar, reducir, mejorar, estabilizar, probar, validar.",
      "- Nunca declares causalidad. Si algo se observó durante un periodo, dilo así, nunca como una garantía futura.",
      "- Deja ESTRATEGIA_RECOMENDADA, CANALES y PLAN_MEDICION vacíos o con una nota breve — no son el objetivo de este análisis.",
      "Responde ÚNICAMENTE en este formato exacto, con cada marcador en su propia línea seguido de dos puntos, sin texto adicional antes o después:",
      briefFormat,
      "No repitas los marcadores. No añadas explicaciones fuera de este formato. No generes ningún marcador ESCENARIO_*.",
    ].join("\n\n");
  }

  const scenarioFormat = SCENARIO_KINDS.map((kind) =>
    [
      `${scenarioMarker(kind, "OBJETIVO")}:\n<texto>`,
      `${scenarioMarker(kind, "INTENSIDAD")}:\n<texto corto, ej. "baja", "media", "alta">`,
      `${scenarioMarker(kind, "ACCIONES")}:\n<una acción por línea con el formato: Título :: Descripción :: Canal>`,
      `${scenarioMarker(kind, "RECURSOS")}:\n<un recurso por línea>`,
      `${scenarioMarker(kind, "RIESGOS")}:\n<un riesgo por línea>`,
      `${scenarioMarker(kind, "KPIS")}:\n<un KPI por línea>`,
      `${scenarioMarker(kind, "PRECONDICIONES")}:\n<una condición previa por línea>`,
      `${scenarioMarker(kind, "RESTRICCIONES")}:\n<una restricción por línea>`,
      `${scenarioMarker(kind, "PLAZO")}:\n<texto corto>`,
      `${scenarioMarker(kind, "MEDICION")}:\n<texto>`,
    ].join("\n")
  ).join("\n");

  return [
    "Eres el estratega de Marketing Brain de AI Content Hub, generando una propuesta de optimización basada ÚNICAMENTE en los datos reales de rendimiento que se te proporcionan.",
    "Reglas obligatorias:",
    "- Nunca inventes cifras de conversión, ingresos, ROI, coste, presupuesto o tamaño de audiencia. Si el contexto no incluye un número real, usa palabras direccionales: aumentar, reducir, mejorar, estabilizar, probar, validar.",
    "- Si el contexto incluye un presupuesto real, respétalo exactamente y no lo conviertas de moneda.",
    "- Nunca declares causalidad. Si algo se observó durante un periodo, dilo así, nunca como una garantía futura.",
    "- Si los datos son insuficientes para un escenario honesto, dilo explícitamente en HALLAZGOS o LIMITACIONES en vez de inventar contenido para ese escenario.",
    "Responde ÚNICAMENTE en este formato exacto, con cada marcador en su propia línea seguido de dos puntos, sin texto adicional antes o después:",
    briefFormat,
    scenarioFormat,
    "No repitas los marcadores. No añadas explicaciones fuera de este formato.",
  ].join("\n\n");
}

export function buildScenarioGenerationUserPrompt(input: ScenarioGenerationContextInput): string {
  const section = (label: string, items: string[]) => (items.length > 0 ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : `${label}: (ninguno)`);
  return [
    `Proyecto/campaña: ${input.campaignOrProjectName}`,
    `Objetivo declarado: ${input.objective || "(no especificado)"}`,
    `Periodo analizado: ${input.periodLabel}`,
    `Calidad de datos: ${input.dataQualityLevel} — Solidez de evidencia: ${input.evidenceStrength}`,
    input.hasBudget ? `Presupuesto real disponible: ${input.budgetLabel}` : "Presupuesto real disponible: (ninguno declarado — no asignes presupuesto)",
    section("HECHOS OBSERVADOS", input.factsSummary),
    section("CÁLCULOS DERIVADOS", input.derivedSummary),
    section("SEÑALES (tendencias/anomalías/reglas)", input.signalsSummary),
    section("HIPÓTESIS YA IDENTIFICADAS (no confirmadas)", input.hypothesesSummary),
    section("LIMITACIONES DE LOS DATOS", input.constraintsSummary),
    section("INFORMACIÓN AUSENTE", input.missingDataSummary),
  ].join("\n\n");
}

function extractSection(raw: string, marker: string): string | null {
  const pattern = new RegExp(`^${marker}:\\s*$`, "m");
  const match = pattern.exec(raw);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = raw.slice(start);
  const nextMarkerPattern = /^[A-ZÁÉÍÓÚÑ_]+:\s*$/m;
  const nextMatch = nextMarkerPattern.exec(rest);
  return (nextMatch ? rest.slice(0, nextMatch.index) : rest).trim();
}

function toListItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function parseActionLines(text: string): ParsedScenarioAction[] {
  return toListItems(text)
    .map((line) => {
      const parts = line.split("::").map((p) => p.trim());
      return { title: parts[0] ?? "", description: parts[1] ?? "", channel: parts[2] ?? "" };
    })
    .filter((a) => a.title);
}

/** Pure, deterministic — never throws on malformed/partial AI output; missing sections just come back empty, missing scenarios just aren't included (never fabricated to force exactly 3). */
export function parseScenarioGenerationText(raw: string): ParsedScenarioGeneration {
  const brief: ParsedStrategyBrief = {
    executiveSummary: "",
    observedSituation: "",
    dataBackedFindings: [],
    dataLimitations: [],
    objectives: [],
    opportunities: [],
    risks: [],
    hypotheses: [],
    recommendedStrategy: "",
    channels: [],
    kpis: [],
    successSignals: [],
    deteriorationSignals: [],
    measurementPlan: "",
    reviewConditions: [],
  };

  for (const { marker, field, list } of BRIEF_MARKERS) {
    const section = extractSection(raw, marker);
    if (section === null) continue;
    if (list) (brief[field] as string[]) = toListItems(section);
    else (brief[field] as string) = section;
  }

  const scenarios: ParsedScenario[] = [];
  for (const kind of SCENARIO_KINDS) {
    const objective = extractSection(raw, scenarioMarker(kind, "OBJETIVO"));
    const intensity = extractSection(raw, scenarioMarker(kind, "INTENSIDAD"));
    if (objective === null && intensity === null) continue; // this scenario simply wasn't produced — never fabricate a placeholder.

    scenarios.push({
      kind,
      objective: objective ?? "",
      intensity: intensity ?? "",
      actions: parseActionLines(extractSection(raw, scenarioMarker(kind, "ACCIONES")) ?? ""),
      resourcesRequired: toListItems(extractSection(raw, scenarioMarker(kind, "RECURSOS")) ?? ""),
      risks: toListItems(extractSection(raw, scenarioMarker(kind, "RIESGOS")) ?? ""),
      kpis: toListItems(extractSection(raw, scenarioMarker(kind, "KPIS")) ?? ""),
      preconditions: toListItems(extractSection(raw, scenarioMarker(kind, "PRECONDICIONES")) ?? ""),
      constraints: toListItems(extractSection(raw, scenarioMarker(kind, "RESTRICCIONES")) ?? ""),
      timeframe: extractSection(raw, scenarioMarker(kind, "PLAZO")) ?? "",
      measurementMethod: extractSection(raw, scenarioMarker(kind, "MEDICION")) ?? "",
    });
  }

  return { brief, scenarios };
}

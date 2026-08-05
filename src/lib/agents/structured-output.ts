import { z } from "zod";
import type { OutputFieldSpec } from "@/lib/agents/types";

/**
 * The ONE shared structured-output engine every agent's `outputFields`
 * compose against — never a bespoke parser per agent (spec section 7: "no
 * dupliques"). Same marker-delimited text convention as
 * src/lib/campaign-studio/strategy-ai.ts, generalized so a single
 * build/parse/validate/repair triplet covers all 11 output types.
 */

export type FieldValue = string | string[] | number | null;
export type StructuredRecord = Record<string, FieldValue>;

export function buildStructuredSystemPrompt(role: string, fields: OutputFieldSpec[], brandContext: string, extraInstructions: string[] = []): string {
  const format = fields
    .map((f) => {
      if (f.kind === "list") return `${f.marker}:\n<un elemento por línea, sin viñetas ni numeración>`;
      if (f.kind === "enum") return `${f.marker}: <una de estas opciones exactas: ${(f.enumValues ?? []).join(" | ")}>`;
      if (f.kind === "number") return `${f.marker}: <número entero>`;
      return `${f.marker}:\n<texto>`;
    })
    .join("\n");

  return [
    role,
    "Responde ÚNICAMENTE en este formato exacto, con cada marcador en su propia línea seguido de dos puntos, sin texto adicional antes o después:",
    format,
    "No repitas los marcadores. No añadas explicaciones fuera de este formato.",
    ...extraInstructions,
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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

function parseNumber(text: string): number | null {
  const n = Number.parseInt(text.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Pure, deterministic — never throws on malformed/partial AI output; missing sections just come back empty. */
export function parseStructuredText(raw: string, fields: OutputFieldSpec[]): StructuredRecord {
  const result: StructuredRecord = {};
  for (const f of fields) {
    const section = extractSection(raw, f.marker);
    if (f.kind === "list") {
      result[f.field] = section === null ? [] : toListItems(section);
    } else if (f.kind === "number") {
      result[f.field] = section === null ? null : parseNumber(section);
    } else {
      result[f.field] = section ?? "";
    }
  }
  return result;
}

function fieldZodType(f: OutputFieldSpec) {
  if (f.kind === "list") return z.array(z.string().max(f.maxLength ?? 500)).max(f.maxItems ?? 50);
  if (f.kind === "enum") return z.enum((f.enumValues ?? [""]) as [string, ...string[]]);
  if (f.kind === "number") return z.number().int().nullable();
  return z.string().max(f.maxLength ?? 8000);
}

/** Strict schema every parsed agent output must satisfy before being persisted (spec section 7: "esquemas estrictos"). */
export function buildStructuredZodSchema(fields: OutputFieldSpec[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.field, fieldZodType(f)])));
}

/** Controlled repair: truncates over-length text/list values to the schema's own limits rather than discarding the whole result — mirrors Marketing Brain's GENERATE_STRATEGY repair (spec section 7: "intenta una reparación controlada"). Never repairs an enum — an invalid enum value means the AI genuinely didn't follow instructions and must be treated as a failure. */
export function repairStructuredOutput(parsed: StructuredRecord, fields: OutputFieldSpec[]): { repaired: StructuredRecord; enumFailed: boolean } {
  const repaired: StructuredRecord = {};
  let enumFailed = false;
  for (const f of fields) {
    const value = parsed[f.field];
    if (f.kind === "list") {
      repaired[f.field] = Array.isArray(value) ? value.slice(0, f.maxItems ?? 50).map((v) => v.slice(0, f.maxLength ?? 500)) : [];
    } else if (f.kind === "enum") {
      const enumValues = f.enumValues ?? [];
      if (typeof value === "string" && enumValues.includes(value)) {
        repaired[f.field] = value;
      } else {
        repaired[f.field] = enumValues[0] ?? "";
        enumFailed = true;
      }
    } else if (f.kind === "number") {
      repaired[f.field] = typeof value === "number" ? value : null;
    } else {
      repaired[f.field] = typeof value === "string" ? value.slice(0, f.maxLength ?? 8000) : "";
    }
  }
  return { repaired, enumFailed };
}

/** True when the parsed result has no meaningful content at all (every text field empty, every list field empty) — a sign the model ignored the format entirely, which must be treated as a failure rather than persisted as an empty "success" (spec section 7: "no guardarse como éxito si falta la estructura obligatoria"). */
export function isStructuredOutputEmpty(parsed: StructuredRecord): boolean {
  return Object.values(parsed).every((v) => (Array.isArray(v) ? v.length === 0 : v === null || v === "" || (typeof v === "string" && !v.trim())));
}

// ---------------------------------------------------------------------------
// Repeating-block variant (for "variant_set" and any other list-of-records
// output) — same "---BLOQUE--- / MARCA: valor / ---FIN---" convention as
// src/lib/campaign-studio/plan-ai.ts's piece drafts, generalized so it's
// never re-implemented per agent.
// ---------------------------------------------------------------------------

export function buildBlockSystemPrompt(role: string, blockMarker: string, fields: OutputFieldSpec[], brandContext: string, extraInstructions: string[] = []): string {
  const format = fields
    .map((f) => `${f.marker}: <${f.kind === "list" ? "lista separada por comas" : f.kind === "enum" ? (f.enumValues ?? []).join(" | ") : f.kind === "number" ? "número entero" : "texto"}>`)
    .join("\n");
  return [
    role,
    `Responde ÚNICAMENTE con bloques en este formato exacto, uno por elemento, sin texto adicional:`,
    `---${blockMarker}---`,
    format,
    `---FIN---`,
    ...extraInstructions,
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseBlockKeyValues(block: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^([A-ZÁÉÍÓÚÑ_]+):\s*(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

/** Pure, deterministic — malformed blocks (missing every required marker) are silently dropped rather than crashing the caller. */
export function parseBlockText(raw: string, blockMarker: string, fields: OutputFieldSpec[]): StructuredRecord[] {
  const blocks = raw.split(`---${blockMarker}---`).slice(1);
  const items: StructuredRecord[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split("---FIN---")[0] ?? rawBlock;
    const values = parseBlockKeyValues(block);
    if (Object.keys(values).length === 0) continue;

    const item: StructuredRecord = {};
    for (const f of fields) {
      const raw = values[f.marker] ?? "";
      item[f.field] = f.kind === "list" ? raw.split(",").map((v) => v.trim()).filter(Boolean) : f.kind === "number" ? parseNumber(raw) : raw;
    }
    items.push(item);
  }
  return items;
}

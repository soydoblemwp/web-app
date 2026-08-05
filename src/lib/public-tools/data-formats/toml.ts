/**
 * TOML core (spec section 16), via `smol-toml` (spec-compliant TOML 1.0,
 * pure JS, no execution of any kind). Duplicate keys and redefined tables
 * are rejected by the library itself with line/column (TOML 1.0 requires
 * this). Integers outside JS's safe range are parsed as `BigInt`
 * (`integersAsBigInt: true`) and then handled explicitly here — string or
 * rejected, matching `yaml.ts`'s identical strategy, never silently
 * rounded. Dates use `TomlDate`, a `Date` subclass whose own `toJSON()`
 * (not the inherited `Date.prototype.toString()`, which applies the
 * *local system's* timezone) reproduces the exact TOML source
 * representation — offset date-times keep their offset, local
 * date/time/date-time values stay zone-less. This module always uses
 * `.toJSON()`/`.isLocal()`, never a raw `Date` conversion, so a local TOML
 * date is never silently reinterpreted as UTC.
 */
import * as TOML from "smol-toml";
import { DOCUMENT_LIMITS } from "../documents/limits";
import type { FormatParseError } from "./errors";
import { safeObjectFromEntries, countNodesAndDepth } from "./safe-values";

const LIMITS = DOCUMENT_LIMITS.dataFormats;

export interface LargeIntegerNote {
  path: string;
  raw: string;
}

export interface TomlToJsonOptions {
  largeIntegerStrategy: "string" | "reject";
}

export interface TomlToJsonResult {
  ok: boolean;
  error?: FormatParseError;
  value?: unknown;
  largeIntegers: LargeIntegerNote[];
  skippedKeys: string[];
  dateStrategyNote: string;
}

const DATE_STRATEGY_NOTE = "Las fechas y horas TOML se convierten a texto ISO 8601 exactamente como aparecen en el origen: los valores con zona (offset date-time) conservan su \"Z\" u offset, y los valores locales (local date-time, local date, local time) se mantienen sin zona — nunca se reinterpretan como UTC ni se convierten a la zona horaria de este dispositivo.";

function isTomlDate(node: unknown): node is TOML.TomlDate {
  return node instanceof TOML.TomlDate;
}

function sanitizeValue(node: unknown, path: string, strategy: TomlToJsonOptions["largeIntegerStrategy"], largeIntegers: LargeIntegerNote[], skippedKeys: string[]): unknown {
  if (typeof node === "bigint") {
    const raw = node.toString();
    if (node >= BigInt(Number.MIN_SAFE_INTEGER) && node <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(node);
    largeIntegers.push({ path, raw });
    return strategy === "string" ? raw : null;
  }
  if (isTomlDate(node)) {
    return node.toJSON();
  }
  if (Array.isArray(node)) {
    return node.map((item, i) => sanitizeValue(item, `${path}[${i}]`, strategy, largeIntegers, skippedKeys));
  }
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node as Record<string, unknown>);
    const { value, skippedKeys: skipped } = safeObjectFromEntries(entries.map(([k, v]) => [k, sanitizeValue(v, `${path}.${k}`, strategy, largeIntegers, skippedKeys)] as const));
    skippedKeys.push(...skipped.map((k) => `${path}.${k}`));
    return value;
  }
  return node;
}

export function tomlToJson(text: string, options: TomlToJsonOptions): TomlToJsonResult {
  if (text.length > LIMITS.maxTextLength) {
    return { ok: false, error: { message: `El texto supera el límite de ${LIMITS.maxTextLength.toLocaleString("es-ES")} caracteres.`, line: null, column: null, snippet: null }, largeIntegers: [], skippedKeys: [], dateStrategyNote: DATE_STRATEGY_NOTE };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = TOML.parse(text, { integersAsBigInt: true }) as Record<string, unknown>;
  } catch (err) {
    const tomlErr = err as { message?: string; line?: number; column?: number };
    return { ok: false, error: { message: tomlErr.message ?? "TOML inválido.", line: tomlErr.line ?? null, column: tomlErr.column ?? null, snippet: null }, largeIntegers: [], skippedKeys: [], dateStrategyNote: DATE_STRATEGY_NOTE };
  }

  const largeIntegers: LargeIntegerNote[] = [];
  const skippedKeys: string[] = [];
  const value = sanitizeValue(parsed, "$", options.largeIntegerStrategy, largeIntegers, skippedKeys);

  const { nodes, depthExceeded } = countNodesAndDepth(value, LIMITS.maxDepth);
  if (nodes > LIMITS.tomlMaxTables) {
    return { ok: false, error: { message: `El documento supera el límite de ${LIMITS.tomlMaxTables.toLocaleString("es-ES")} tablas/nodos.`, line: null, column: null, snippet: null }, largeIntegers, skippedKeys, dateStrategyNote: DATE_STRATEGY_NOTE };
  }
  if (depthExceeded) {
    return { ok: false, error: { message: `El documento supera la profundidad máxima permitida (${LIMITS.maxDepth}).`, line: null, column: null, snippet: null }, largeIntegers, skippedKeys, dateStrategyNote: DATE_STRATEGY_NOTE };
  }
  if (options.largeIntegerStrategy === "reject" && largeIntegers.length > 0) {
    return {
      ok: false,
      error: { message: `El documento contiene ${largeIntegers.length} entero(s) fuera del rango seguro de JSON (ej. ${largeIntegers[0].raw} en ${largeIntegers[0].path}).`, line: null, column: null, snippet: null },
      largeIntegers,
      skippedKeys,
      dateStrategyNote: DATE_STRATEGY_NOTE,
    };
  }

  return { ok: true, value, largeIntegers, skippedKeys, dateStrategyNote: DATE_STRATEGY_NOTE };
}

export interface JsonToTomlResult {
  ok: boolean;
  error?: string;
  toml?: string;
}

export function jsonToToml(value: unknown): JsonToTomlResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "TOML requiere un objeto de nivel superior (no un array ni un valor simple)." };
  }
  try {
    const toml = TOML.stringify(value as Record<string, unknown>);
    return { ok: true, toml };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo convertir el JSON a TOML." };
  }
}

export function formatToml(text: string): { ok: boolean; error?: FormatParseError; formatted?: string } {
  const result = tomlToJson(text, { largeIntegerStrategy: "string" });
  if (!result.ok) return { ok: false, error: result.error };
  const stringified = TOML.stringify(result.value as Record<string, unknown>);
  return { ok: true, formatted: stringified };
}

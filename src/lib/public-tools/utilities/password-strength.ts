import { COMMON_PASSWORDS, SPANISH_MONTHS, ENGLISH_MONTHS, KEYBOARD_ROWS } from "./common-passwords";
import { UTILITY_LIMITS } from "./limits";

export type StrengthLabel = "MUY_DÉBIL" | "DÉBIL" | "MODERADA" | "FUERTE" | "MUY_FUERTE";

export interface StrengthFinding {
  code: string;
  message: string;
  penalty: number;
}

export interface PasswordStrengthResult {
  label: StrengthLabel;
  score: number; // 0-100, purely for internal ordering — never shown as a false-precision "security score"
  length: number;
  varietyCount: number;
  findings: StrengthFinding[];
  recommendations: string[];
  /** Educational-only approximation, never a guarantee — see crackTimeExplanation. */
  crackTimeEstimate: string | null;
  crackTimeExplanation: string;
}

function hasSequential(lower: string, minRun: number): boolean {
  for (let i = 0; i <= lower.length - minRun; i++) {
    let ascending = true;
    let descending = true;
    for (let j = 1; j < minRun; j++) {
      const diff = lower.charCodeAt(i + j) - lower.charCodeAt(i + j - 1);
      if (diff !== 1) ascending = false;
      if (diff !== -1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

function hasKeyboardRun(lower: string, minRun: number): boolean {
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= row.length - minRun; i++) {
      const forward = row.slice(i, i + minRun);
      const backward = Array.from(forward).reverse().join("");
      if (lower.includes(forward) || lower.includes(backward)) return true;
    }
  }
  return false;
}

function hasRepeatedBlock(value: string): boolean {
  // Detects an immediately-repeated substring of length >= 2 covering >= 40% of the password (e.g. "abcabc", "xyxyxyxy").
  for (let blockLen = 2; blockLen <= Math.floor(value.length / 2); blockLen++) {
    const block = value.slice(0, blockLen);
    let repeats = 0;
    let pos = 0;
    while (value.slice(pos, pos + blockLen) === block) {
      repeats++;
      pos += blockLen;
    }
    if (repeats >= 2 && repeats * blockLen >= value.length * 0.6) return true;
  }
  return false;
}

function hasRepeatedChar(value: string, minRun: number): boolean {
  let run = 1;
  for (let i = 1; i < value.length; i++) {
    run = value[i] === value[i - 1] ? run + 1 : 1;
    if (run >= minRun) return true;
  }
  return false;
}

function hasDatePattern(value: string): boolean {
  // Full years (1900-2099), or DD/MM or MM/DD-style short dates.
  return /(19|20)\d{2}/.test(value) || /\b(0?[1-9]|[12]\d|3[01])[/\-.](0?[1-9]|1[0-2])\b/.test(value);
}

function containsMonthName(lower: string): boolean {
  return [...SPANISH_MONTHS, ...ENGLISH_MONTHS].some((month) => lower.includes(month));
}

function trivialSubstitution(lower: string): string {
  // Normalizes the most common leetspeak substitutions so "p4ssw0rd" still matches "password".
  return lower
    .replace(/[@4]/g, "a")
    .replace(/[38]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t");
}

function characterSetSize(value: string): number {
  let size = 0;
  if (/[a-z]/.test(value)) size += 26;
  if (/[A-Z]/.test(value)) size += 26;
  if (/[0-9]/.test(value)) size += 10;
  if (/[^A-Za-z0-9]/.test(value)) size += 33;
  return size || 1;
}

/**
 * Analyzes a password entirely client-side. Never sends, stores, or logs
 * the value (spec section 10) — the caller is responsible for keeping it
 * out of URLs/history/analytics; this function is a pure computation.
 */
export function analyzePasswordStrength(password: string): PasswordStrengthResult {
  const value = password.slice(0, UTILITY_LIMITS.passwordStrength.maxLength);
  const lower = value.toLowerCase();
  const normalized = trivialSubstitution(lower);

  const findings: StrengthFinding[] = [];
  const recommendations: string[] = [];

  if (value.length === 0) {
    return {
      label: "MUY_DÉBIL",
      score: 0,
      length: 0,
      varietyCount: 0,
      findings: [],
      recommendations: ["Escribe una contraseña para analizarla."],
      crackTimeEstimate: null,
      crackTimeExplanation: "Introduce una contraseña para ver una estimación educativa.",
    };
  }

  let score = 0;

  // Length is the strongest real signal.
  if (value.length < 8) {
    findings.push({ code: "too-short", message: `Solo tiene ${value.length} caracteres; se recomiendan al menos 12.`, penalty: 30 });
  } else if (value.length < 12) {
    findings.push({ code: "short", message: `Tiene ${value.length} caracteres; 12 o más es más resistente.`, penalty: 10 });
    score += 20;
  } else if (value.length < 16) {
    score += 35;
  } else {
    score += 50;
  }

  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  score += varietyCount * 8;
  if (varietyCount <= 1) {
    findings.push({ code: "low-variety", message: "Usa un solo tipo de carácter (por ejemplo, solo minúsculas).", penalty: 20 });
  } else if (varietyCount === 2) {
    findings.push({ code: "medium-variety", message: "Combina solo dos tipos de carácter; añadir más variedad ayuda.", penalty: 10 });
  }

  if (hasRepeatedChar(value, 4)) {
    findings.push({ code: "repeated-char", message: "Contiene 4 o más repeticiones seguidas del mismo carácter.", penalty: 15 });
  }
  if (hasRepeatedBlock(value)) {
    findings.push({ code: "repeated-block", message: "Contiene un bloque de caracteres repetido (por ejemplo, \"abcabc\").", penalty: 15 });
  }
  if (hasSequential(lower, 4)) {
    findings.push({ code: "sequential", message: "Contiene una secuencia obvia (por ejemplo, \"abcd\" o \"4321\").", penalty: 15 });
  }
  if (hasKeyboardRun(lower, 4)) {
    findings.push({ code: "keyboard-pattern", message: "Contiene un patrón de teclado (por ejemplo, \"qwerty\" o \"asdf\").", penalty: 15 });
  }
  if (hasDatePattern(value)) {
    findings.push({ code: "date-pattern", message: "Parece incluir una fecha (año o día/mes), fácil de adivinar si es personal.", penalty: 10 });
  }
  if (containsMonthName(lower)) {
    findings.push({ code: "month-name", message: "Contiene el nombre de un mes.", penalty: 10 });
  }
  if (COMMON_PASSWORDS.some((common) => normalized.includes(common))) {
    findings.push({ code: "common-word", message: "Contiene una palabra o contraseña extremadamente común.", penalty: 35 });
  }

  score -= findings.reduce((sum, f) => sum + f.penalty, 0);
  score = Math.max(0, Math.min(100, score));

  let label: StrengthLabel;
  if (score < 20) label = "MUY_DÉBIL";
  else if (score < 40) label = "DÉBIL";
  else if (score < 60) label = "MODERADA";
  else if (score < 80) label = "FUERTE";
  else label = "MUY_FUERTE";

  if (value.length < 12) recommendations.push("Aumenta la longitud a al menos 12-16 caracteres; es el factor más importante.");
  if (varietyCount < 3) recommendations.push("Combina mayúsculas, minúsculas, números y símbolos.");
  if (findings.some((f) => f.code === "common-word")) recommendations.push("Evita palabras o contraseñas comunes conocidas.");
  if (findings.some((f) => f.code === "date-pattern" || f.code === "month-name")) recommendations.push("Evita fechas o datos personales predecibles.");
  recommendations.push("Usa una contraseña distinta para cada servicio.");
  recommendations.push("Guarda tus contraseñas en un administrador de contraseñas en lugar de memorizarlas o reutilizarlas.");
  recommendations.push("Activa la autenticación multifactor cuando esté disponible.");

  // Educational-only crack-time approximation — see crackTimeExplanation for the explicit assumptions/caveats.
  const setSize = characterSetSize(value);
  const combinations = Math.pow(setSize, value.length);
  const guessesPerSecond = 10_000_000_000; // 1e10/s — a commonly cited offline-attack reference point, not a real attacker's actual speed
  const seconds = combinations / (2 * guessesPerSecond);
  const crackTimeEstimate = formatDuration(seconds);

  return {
    label,
    score,
    length: value.length,
    varietyCount,
    findings,
    recommendations,
    crackTimeEstimate,
    crackTimeExplanation:
      "Aproximación educativa, no una garantía: asume 10.000 millones de intentos por segundo (una referencia habitual para ataques fuera de línea) y que el atacante no conoce ningún patrón de esta contraseña. Un atacante con más potencia, o que aproveche los patrones detectados arriba, puede ser mucho más rápido.",
  };
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "no calculable";
  if (seconds < 1) return "menos de un segundo";
  const units: [string, number][] = [
    ["siglos", 60 * 60 * 24 * 365 * 100],
    ["años", 60 * 60 * 24 * 365],
    ["días", 60 * 60 * 24],
    ["horas", 60 * 60],
    ["minutos", 60],
    ["segundos", 1],
  ];
  for (const [unit, unitSeconds] of units) {
    if (seconds >= unitSeconds) {
      const value = seconds / unitSeconds;
      const rounded = value > 1000 ? "más de 1.000" : Math.round(value).toLocaleString("es-ES");
      return `aproximadamente ${rounded} ${unit}`;
    }
  }
  return "menos de un segundo";
}

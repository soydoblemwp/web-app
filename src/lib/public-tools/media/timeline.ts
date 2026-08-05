/**
 * Time parsing/formatting shared by every audio/video tool's manual time
 * fields (spec section 16: "los usuarios deben poder escribir tiempos
 * manualmente... normaliza internamente a milisegundos"). Every timeline
 * UI in this suite reads/writes through these functions instead of
 * hand-rolling its own regex.
 */

const HMS_PATTERN = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const MS_PATTERN = /^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/;
const SECONDS_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;

export interface TimeParseResult {
  ok: boolean;
  milliseconds?: number;
  error?: string;
}

function padFraction(fraction: string | undefined): number {
  if (!fraction) return 0;
  return Number(fraction.padEnd(3, "0").slice(0, 3));
}

/** Accepts "HH:MM:SS.mmm", "MM:SS.mmm", or plain (possibly decimal) seconds — spec section 16's exact 3 accepted formats. */
export function parseTimeToMs(raw: string): TimeParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "El tiempo no puede estar vacío." };

  const hms = HMS_PATTERN.exec(trimmed);
  if (hms) {
    const [, h, m, s, frac] = hms;
    const minutes = Number(m);
    const seconds = Number(s);
    if (minutes > 59 || seconds > 59) return { ok: false, error: "Los minutos y segundos deben estar entre 0 y 59." };
    const ms = (Number(h) * 3600 + minutes * 60 + seconds) * 1000 + padFraction(frac);
    return { ok: true, milliseconds: ms };
  }

  const ms2 = MS_PATTERN.exec(trimmed);
  if (ms2) {
    const [, m, s, frac] = ms2;
    const seconds = Number(s);
    if (seconds > 59) return { ok: false, error: "Los segundos deben estar entre 0 y 59." };
    const ms = (Number(m) * 60 + seconds) * 1000 + padFraction(frac);
    return { ok: true, milliseconds: ms };
  }

  const secs = SECONDS_PATTERN.exec(trimmed);
  if (secs) {
    const [, whole, frac] = secs;
    const ms = Number(whole) * 1000 + padFraction(frac);
    return { ok: true, milliseconds: ms };
  }

  return { ok: false, error: 'Formato no reconocido. Usa HH:MM:SS.mmm, MM:SS.mmm o segundos (ej. "12.5").' };
}

export function formatMsToTimecode(ms: number, includeHours = true): string {
  const clamped = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const millis = clamped % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  if (includeHours || hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

/** FFmpeg CLI accepts plain "HH:MM:SS.mmm" for -ss/-to — this always includes hours so the generated command is unambiguous regardless of duration. */
export function msToFfmpegTimestamp(ms: number): string {
  return formatMsToTimecode(ms, true);
}

export interface TimeRangeValidation {
  ok: boolean;
  error?: string;
}

export function validateTimeRange(startMs: number, endMs: number, durationMs: number, minDurationMs = 100): TimeRangeValidation {
  if (startMs < 0 || endMs < 0) return { ok: false, error: "Los tiempos no pueden ser negativos." };
  if (startMs >= endMs) return { ok: false, error: "El inicio debe ser menor que el final." };
  if (durationMs > 0 && endMs > durationMs + 50) return { ok: false, error: "El final supera la duración del archivo." };
  if (endMs - startMs < minDurationMs) return { ok: false, error: `La selección debe durar al menos ${minDurationMs} ms.` };
  return { ok: true };
}

/**
 * Pure SRT/WebVTT parsing, editing, and conversion — no FFmpeg, no
 * browser API, fully real-testable in Node (spec section 28 explicitly
 * scopes this tool to editing/converting cues, never burning them into a
 * video, transcription, or translation).
 */
export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export type SubtitleFormat = "srt" | "vtt";

export interface SubtitleParseFinding {
  cueIndex: number;
  severity: "ERROR" | "WARNING";
  message: string;
}

export interface SubtitleParseResult {
  ok: boolean;
  cues: SubtitleCue[];
  format: SubtitleFormat | null;
  findings: SubtitleParseFinding[];
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function detectSubtitleFormat(rawText: string): SubtitleFormat | null {
  const text = normalizeLineEndings(stripBom(rawText)).trim();
  if (text.startsWith("WEBVTT")) return "vtt";
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(text)) return "srt";
  if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) return text.includes(",") && !text.includes(".") ? "srt" : "vtt";
  return null;
}

function timeToMsSrt(h: string, m: string, s: string, ms: string): number {
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms);
}

let cueIdCounter = 0;
function nextCueId(): string {
  cueIdCounter += 1;
  return `cue-${cueIdCounter}`;
}

export function parseSrt(rawText: string): SubtitleParseResult {
  const text = normalizeLineEndings(stripBom(rawText));
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];
  const findings: SubtitleParseFinding[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split("\n");
    let lineIndex = 0;
    // Optional numeric index line.
    if (/^\d+$/.test(lines[0]?.trim() ?? "")) lineIndex = 1;
    const timingLine = lines[lineIndex];
    const match = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/.exec(timingLine ?? "");
    if (!match) {
      findings.push({ cueIndex: index, severity: "ERROR", message: `Bloque ${index + 1}: no se encontró una línea de tiempo válida.` });
      return;
    }
    const startMs = timeToMsSrt(match[1], match[2], match[3], match[4]);
    const endMs = timeToMsSrt(match[5], match[6], match[7], match[8]);
    const textLines = lines.slice(lineIndex + 1);
    cues.push({ id: nextCueId(), startMs, endMs, text: textLines.join("\n") });
  });

  return { ok: findings.every((f) => f.severity !== "ERROR"), cues, format: "srt", findings };
}

function timeToMsVtt(h: string, m: string, s: string, ms: string): number {
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms);
}

export function parseVtt(rawText: string): SubtitleParseResult {
  const text = normalizeLineEndings(stripBom(rawText));
  const withoutHeader = text.replace(/^WEBVTT[^\n]*\n/, "");
  const blocks = withoutHeader.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];
  const findings: SubtitleParseFinding[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split("\n");
    let lineIndex = 0;
    const timingMatch = (line: string | undefined) => /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(line ?? "");
    let match = timingMatch(lines[0]);
    if (!match) {
      lineIndex = 1;
      match = timingMatch(lines[1]);
    }
    if (!match) {
      findings.push({ cueIndex: index, severity: "ERROR", message: `Bloque ${index + 1}: no se encontró una línea de tiempo válida.` });
      return;
    }
    const startMs = timeToMsVtt(match[1], match[2], match[3], match[4]);
    const endMs = timeToMsVtt(match[5], match[6], match[7], match[8]);
    const textLines = lines.slice(lineIndex + 1);
    cues.push({ id: nextCueId(), startMs, endMs, text: textLines.join("\n") });
  });

  return { ok: findings.every((f) => f.severity !== "ERROR"), cues, format: "vtt", findings };
}

export function parseSubtitles(rawText: string): SubtitleParseResult {
  const format = detectSubtitleFormat(rawText);
  if (format === "vtt") return parseVtt(rawText);
  if (format === "srt") return parseSrt(rawText);
  return { ok: false, cues: [], format: null, findings: [{ cueIndex: -1, severity: "ERROR", message: "No se reconoció el formato como SRT ni WebVTT." }] };
}

function msToSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function msToVttTimestamp(ms: number): string {
  return msToSrtTimestamp(ms).replace(",", ".");
}

export function buildSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, i) => `${i + 1}\n${msToSrtTimestamp(cue.startMs)} --> ${msToSrtTimestamp(cue.endMs)}\n${cue.text}`).join("\n\n") + "\n";
}

export function buildVtt(cues: SubtitleCue[]): string {
  const body = cues.map((cue) => `${msToVttTimestamp(cue.startMs)} --> ${msToVttTimestamp(cue.endMs)}\n${cue.text}`).join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function shiftAllTimes(cues: SubtitleCue[], deltaMs: number): SubtitleCue[] {
  return cues.map((cue) => ({ ...cue, startMs: Math.max(0, cue.startMs + deltaMs), endMs: Math.max(0, cue.endMs + deltaMs) }));
}

export interface OverlapFinding {
  cueAId: string;
  cueBId: string;
}

/** Cues sorted by start time; two adjacent cues overlap when the earlier one's end is after the later one's start. */
export function findOverlaps(cues: SubtitleCue[]): OverlapFinding[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  const overlaps: OverlapFinding[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endMs > sorted[i + 1].startMs) overlaps.push({ cueAId: sorted[i].id, cueBId: sorted[i + 1].id });
  }
  return overlaps;
}

export function findInvalidDurations(cues: SubtitleCue[], minDurationMs = 100): string[] {
  return cues.filter((cue) => cue.endMs <= cue.startMs || cue.endMs - cue.startMs < minDurationMs).map((cue) => cue.id);
}

// --- Cue text safety (spec section 28: no arbitrary HTML, escape everything else) ---
const ALLOWED_VTT_TAGS = new Set(["b", "i", "u"]);

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renders cue text to safe HTML: only a fixed allowlist of plain
 * formatting tags (`<b>`, `<i>`, `<u>`) survive as real tags — every other
 * tag (including `<script>`, `<v>`, `<c>`, and anything with attributes)
 * is escaped to inert text. Never used with `dangerouslySetInnerHTML`
 * directly by a tool without going through this function first.
 */
export function sanitizeCueTextToHtml(raw: string): string {
  const escaped = escapeHtml(raw).replace(/\n/g, "<br />");
  return escaped.replace(/&lt;(\/?)(\w+)&gt;/g, (full, closingSlash: string, tag: string) => {
    const lower = tag.toLowerCase();
    if (ALLOWED_VTT_TAGS.has(lower)) return `<${closingSlash}${lower}>`;
    return full;
  });
}

export function findDangerousCueContent(cues: SubtitleCue[]): string[] {
  const dangerousPattern = /<\s*script|javascript:|on\w+\s*=/i;
  return cues.filter((cue) => dangerousPattern.test(cue.text)).map((cue) => cue.id);
}

/**
 * Minimal RFC 5545 (iCalendar) VEVENT writer — enough to produce a single
 * real, re-parseable meeting invite. Never touches the visitor's calendar;
 * this only builds file bytes for the visitor to download themselves (spec
 * section 14: "no programes reuniones en Google Calendar. No accedas al
 * calendario del usuario.").
 */
export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  startUtc: Date;
  durationMinutes: number;
}

/** Escapes text per RFC 5545 §3.3.11 — backslash, semicolon, comma, and newlines. */
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function formatIcsUtcDate(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Folds a content line at 75 octets per RFC 5545 §3.1 (continuation lines start with a single space). */
function foldLine(line: string): string {
  const MAX_LENGTH = 74;
  if (line.length <= MAX_LENGTH) return line;
  const parts: string[] = [];
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const chunkSize = first ? MAX_LENGTH : MAX_LENGTH - 1;
    parts.push((first ? "" : " ") + remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
    first = false;
  }
  return parts.join("\r\n");
}

export function buildIcsEvent(input: IcsEventInput): string {
  const dtStamp = formatIcsUtcDate(new Date());
  const dtStart = formatIcsUtcDate(input.startUtc);
  const dtEnd = formatIcsUtcDate(new Date(input.startUtc.getTime() + input.durationMinutes * 60000));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Content Hub//Herramientas Publicas//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Generates a real, locally-random UID — never a sequential/predictable counter, and never sent anywhere. */
export function generateIcsUid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}@herramientas.local`;
}

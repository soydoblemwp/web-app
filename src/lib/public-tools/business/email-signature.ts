/**
 * Builds an HTML email signature from an ALLOWLIST of fixed table-based
 * templates — never from arbitrary user-supplied HTML, CSS, or JS (spec
 * section 10: "no permita HTML arbitrario; JavaScript; eventos; estilos
 * suministrados directamente"). Every interpolated value goes through one
 * of exactly three safe paths before it reaches the HTML string:
 *
 *   1. `escapeHtml()` — for any free-text field (name, title, company...).
 *   2. `sanitizeUrl()` — for logo/photo/social links, which rejects
 *      anything that isn't `http:`/`https:`.
 *   3. `sanitizeHexColor()` — for the two theme colors, which rejects
 *      anything that isn't a strict `#rrggbb` hex literal.
 *
 * There is no fourth path — the caller cannot inject a raw `<script>`,
 * an event handler attribute, or a `url(javascript:...)` CSS value,
 * because nothing the caller provides is ever concatenated into the
 * output without going through one of the three functions above.
 */

export type SignatureTemplate = "minimal" | "professional" | "compact" | "corporate" | "creative";

export interface SignatureFields {
  name: string;
  jobTitle: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  legalText: string;
  pronouns: string;
  logoUrl: string;
  photoUrl: string;
  socialLinks: { platform: string; url: string }[];
}

export interface SignatureVisibility {
  jobTitle: boolean;
  company: boolean;
  phone: boolean;
  email: boolean;
  website: boolean;
  address: boolean;
  legalText: boolean;
  pronouns: boolean;
  logo: boolean;
  photo: boolean;
  social: boolean;
}

export interface SignatureStyle {
  template: SignatureTemplate;
  primaryColor: string;
  secondaryColor: string;
  fontSize: number;
  spacing: number;
  showIcons: boolean;
  showDividers: boolean;
  visibility: SignatureVisibility;
}

export const SOCIAL_PLATFORMS = ["LinkedIn", "X", "Instagram", "Facebook", "YouTube", "TikTok", "GitHub", "Otro"] as const;

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Accepts only http:// and https:// URLs — rejects javascript:, data:, vbscript:, file:, and anything else (spec: "no permita... URLs que no sean HTTP/HTTPS"). Returns null (never a placeholder string) when rejected, so callers can honestly omit the field rather than render a broken link. */
export function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function sanitizeHexColor(raw: string, fallback: string): string {
  return HEX_COLOR_PATTERN.test(raw) ? raw : fallback;
}

function clampFontSize(size: number): number {
  return Math.max(10, Math.min(20, Math.round(size)));
}

function clampSpacing(spacing: number): number {
  return Math.max(0, Math.min(16, Math.round(spacing)));
}

interface Line {
  key: keyof SignatureFields;
  value: string;
}

const TEXT_FIELD_KEYS = ["jobTitle", "company", "phone", "email", "website", "address", "pronouns", "legalText"] as const satisfies readonly (keyof SignatureFields)[];

function visibleTextLines(fields: SignatureFields, visibility: SignatureVisibility): Line[] {
  return TEXT_FIELD_KEYS.filter((key) => visibility[key] && fields[key].trim()).map((key) => ({ key, value: fields[key] }));
}

export interface BuiltSignature {
  html: string;
  plainText: string;
  warnings: string[];
}

/**
 * Renders one of five fixed templates. Every template is built from
 * literal, hand-written table/cell markup — the only variation between
 * templates is which safe values get slotted in and how they're arranged,
 * never new raw markup derived from user input.
 */
export function buildSignatureHtml(fields: SignatureFields, style: SignatureStyle): BuiltSignature {
  const warnings: string[] = [];
  const primary = sanitizeHexColor(style.primaryColor, "#1a73e8");
  const secondary = sanitizeHexColor(style.secondaryColor, "#5f6368");
  const fontSize = clampFontSize(style.fontSize);
  const spacing = clampSpacing(style.spacing);
  const name = escapeHtml(fields.name.trim() || "Tu nombre");

  const logoUrl = style.visibility.logo ? sanitizeUrl(fields.logoUrl) : null;
  if (style.visibility.logo && fields.logoUrl.trim() && !logoUrl) warnings.push("La URL del logo no es http/https válida y se omitió.");
  const photoUrl = style.visibility.photo ? sanitizeUrl(fields.photoUrl) : null;
  if (style.visibility.photo && fields.photoUrl.trim() && !photoUrl) warnings.push("La URL de la fotografía no es http/https válida y se omitió.");

  const textLines = visibleTextLines(fields, style.visibility);

  const socialCells = style.visibility.social
    ? fields.socialLinks
        .map((link) => {
          const safeUrl = sanitizeUrl(link.url);
          if (!safeUrl) {
            if (link.url.trim()) warnings.push(`El enlace de ${link.platform || "una red social"} no es http/https válido y se omitió.`);
            return null;
          }
          const label = escapeHtml(link.platform.trim() || "Enlace");
          return `<a href="${escapeHtml(safeUrl)}" style="color:${secondary};text-decoration:none;font-size:${fontSize - 2}px;margin-right:${spacing}px;" target="_blank" rel="noopener noreferrer">${label}</a>`;
        })
        .filter((cell): cell is string => cell !== null)
    : [];

  const divider = style.showDividers ? `<div style="border-top:1px solid #e0e0e0;margin:${spacing}px 0;"></div>` : "";
  const textLinesHtml = textLines
    .map((line) => `<div style="font-size:${fontSize}px;color:${secondary};line-height:1.5;">${escapeHtml(line.value)}</div>`)
    .join("");
  const nameHtml = `<div style="font-size:${fontSize + 3}px;color:${primary};font-weight:bold;">${name}</div>`;
  const photoHtml = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Foto de ${name}" width="64" height="64" style="border-radius:50%;display:block;" />` : "";
  const logoHtml = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logotipo${fields.company.trim() ? ` de ${escapeHtml(fields.company.trim())}` : ""}" style="max-height:48px;display:block;" />` : "";
  const socialHtml = socialCells.length > 0 ? `<div style="margin-top:${spacing}px;">${socialCells.join("")}</div>` : "";

  let html: string;
  switch (style.template) {
    case "compact":
      html = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;"><tr>${
        photoHtml ? `<td style="padding-right:${spacing}px;vertical-align:top;">${photoHtml}</td>` : ""
      }<td style="vertical-align:top;">${nameHtml}<span style="font-size:${fontSize}px;color:${secondary};"> — ${textLines.map((l) => escapeHtml(l.value)).join(" · ")}</span>${socialHtml}</td></tr></table>`;
      break;
    case "corporate":
      html = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Georgia,serif;border-left:3px solid ${primary};padding-left:${spacing + 8}px;"><tr><td>${nameHtml}${textLinesHtml}${divider}${logoHtml}${socialHtml}</td></tr></table>`;
      break;
    case "creative":
      html = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Verdana,sans-serif;background:${primary}0d;padding:${spacing + 6}px;border-radius:8px;"><tr>${
        photoHtml ? `<td style="padding-right:${spacing + 4}px;">${photoHtml}</td>` : ""
      }<td>${nameHtml}${textLinesHtml}${socialHtml}</td></tr></table>`;
      break;
    case "professional":
      html = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;"><tr>${
        photoHtml || logoHtml ? `<td style="padding-right:${spacing + 8}px;vertical-align:top;">${photoHtml}${logoHtml}</td>` : ""
      }<td style="vertical-align:top;border-left:${photoHtml || logoHtml ? `2px solid ${primary};padding-left:${spacing + 8}px;` : "none;"}">${nameHtml}${textLinesHtml}${divider}${socialHtml}</td></tr></table>`;
      break;
    case "minimal":
    default:
      html = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;"><tr><td>${nameHtml}${textLinesHtml}${socialHtml}</td></tr></table>`;
      break;
  }

  const plainTextParts = [fields.name.trim(), ...textLines.map((l) => l.value)].filter(Boolean);
  const plainText = plainTextParts.join("\n");

  return { html, plainText, warnings };
}

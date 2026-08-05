import { escapeHtml } from "@/lib/public-tools/business/email-signature";

export interface OpenGraphInput {
  title: string;
  description: string;
  url: string;
  type: string;
  siteName: string;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string;
  locale: string;
  author: string;
  twitterCard: "summary" | "summary_large_image";
  twitterSite: string;
  twitterCreator: string;
}

export interface OpenGraphFinding {
  field: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
}

const RECOMMENDED_TITLE_MAX = 60;
const RECOMMENDED_DESCRIPTION_MAX = 160;

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pure local validation — never fetches the URL or the image (spec section
 * 11: "no realices fetch de la URL ingresada... no descargues la imagen
 * remota... no realices scraping").
 */
export function validateOpenGraph(input: OpenGraphInput): OpenGraphFinding[] {
  const findings: OpenGraphFinding[] = [];

  if (!input.title.trim()) findings.push({ field: "title", severity: "ERROR", message: "El título es obligatorio." });
  else if (input.title.length > RECOMMENDED_TITLE_MAX) findings.push({ field: "title", severity: "WARNING", message: `El título tiene ${input.title.length} caracteres; se recomienda no superar ${RECOMMENDED_TITLE_MAX}.` });

  if (!input.description.trim()) findings.push({ field: "description", severity: "WARNING", message: "Falta una descripción." });
  else if (input.description.length > RECOMMENDED_DESCRIPTION_MAX) findings.push({ field: "description", severity: "WARNING", message: `La descripción tiene ${input.description.length} caracteres; se recomienda no superar ${RECOMMENDED_DESCRIPTION_MAX}.` });

  if (!input.url.trim()) findings.push({ field: "url", severity: "ERROR", message: "La URL canónica es obligatoria." });
  else if (!isHttpUrl(input.url)) findings.push({ field: "url", severity: "ERROR", message: "La URL debe ser absoluta y usar http o https." });
  else if (input.url.startsWith("http://")) findings.push({ field: "url", severity: "INFO", message: "Se recomienda usar https en lugar de http." });

  if (input.imageUrl.trim()) {
    if (!isHttpUrl(input.imageUrl)) findings.push({ field: "imageUrl", severity: "ERROR", message: "La URL de la imagen debe ser absoluta y usar http o https." });
    if (!input.imageAlt.trim()) findings.push({ field: "imageAlt", severity: "WARNING", message: "Falta el texto alternativo de la imagen." });
    if (input.imageWidth && input.imageHeight) {
      if (input.imageWidth < 200 || input.imageHeight < 200) findings.push({ field: "imageDimensions", severity: "WARNING", message: "Las imágenes pequeñas pueden no mostrarse correctamente en algunas plataformas (se recomienda al menos 1200×630)." });
    } else {
      findings.push({ field: "imageDimensions", severity: "INFO", message: "Especifica ancho y alto de la imagen para una vista previa más fiable." });
    }
  } else {
    findings.push({ field: "imageUrl", severity: "WARNING", message: "Sin imagen, muchas plataformas mostrarán la vista previa sin miniatura." });
  }

  return findings;
}

function metaTag(property: string, content: string): string {
  return `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
}
function metaName(name: string, content: string): string {
  return `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
}

/** Builds the actual tag markup as an escaped, displayable string (never inserted into this app's own DOM — spec section 11: "no inserte etiquetas generadas en el DOM de la aplicación... muéstralas como texto escapado"). */
export function buildOpenGraphTags(input: OpenGraphInput): string {
  const lines: string[] = [];
  lines.push(`<title>${escapeHtml(input.title)}</title>`);
  if (input.description) lines.push(metaName("description", input.description));
  lines.push(`<link rel="canonical" href="${escapeHtml(input.url)}" />`);

  lines.push(metaTag("og:title", input.title));
  if (input.description) lines.push(metaTag("og:description", input.description));
  lines.push(metaTag("og:type", input.type || "website"));
  if (input.url) lines.push(metaTag("og:url", input.url));
  if (input.siteName) lines.push(metaTag("og:site_name", input.siteName));
  if (input.imageUrl) {
    lines.push(metaTag("og:image", input.imageUrl));
    if (input.imageWidth) lines.push(metaTag("og:image:width", String(input.imageWidth)));
    if (input.imageHeight) lines.push(metaTag("og:image:height", String(input.imageHeight)));
    if (input.imageAlt) lines.push(metaTag("og:image:alt", input.imageAlt));
  }
  if (input.locale) lines.push(metaTag("og:locale", input.locale));
  if (input.author) lines.push(metaTag("article:author", input.author));

  lines.push(metaName("twitter:card", input.twitterCard));
  lines.push(metaName("twitter:title", input.title));
  if (input.description) lines.push(metaName("twitter:description", input.description));
  if (input.imageUrl) lines.push(metaName("twitter:image", input.imageUrl));
  if (input.twitterSite) lines.push(metaName("twitter:site", input.twitterSite));
  if (input.twitterCreator) lines.push(metaName("twitter:creator", input.twitterCreator));

  return lines.join("\n");
}

export function buildOpenGraphJson(input: OpenGraphInput): string {
  return JSON.stringify(input, null, 2);
}

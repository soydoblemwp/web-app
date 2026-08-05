export interface UtmParams {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}

export interface UtmPreset {
  id: string;
  label: string;
  source: string;
  medium: string;
}

export const UTM_PRESETS: UtmPreset[] = [
  { id: "newsletter", label: "Newsletter", source: "newsletter", medium: "email" },
  { id: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { id: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { id: "tiktok", label: "TikTok", source: "tiktok", medium: "social" },
  { id: "linkedin", label: "LinkedIn", source: "linkedin", medium: "social" },
  { id: "youtube", label: "YouTube", source: "youtube", medium: "social" },
  { id: "paid", label: "Campaña pagada", source: "google", medium: "cpc" },
];

export interface UtmBuildResult {
  ok: boolean;
  error?: string;
  finalUrl?: string;
  existingUtmParams?: string[];
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** Rejects javascript:/data:/vbscript: and any non-http(s) scheme — a UTM link is only ever meant to point at a real web page. */
export function validateBaseUrl(rawUrl: string): { ok: boolean; error?: string; url?: URL } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "Introduce una URL." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "La URL no es válida. Incluye el protocolo, por ejemplo https://ejemplo.com." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Solo se permiten URLs http:// o https://." };
  }
  return { ok: true, url };
}

export function buildUtmUrl(params: UtmParams): UtmBuildResult {
  const validation = validateBaseUrl(params.url);
  if (!validation.ok || !validation.url) return { ok: false, error: validation.error };

  if (!params.source.trim()) return { ok: false, error: "El campo source es obligatorio." };
  if (!params.medium.trim()) return { ok: false, error: "El campo medium es obligatorio." };
  if (!params.campaign.trim()) return { ok: false, error: "El campo campaign es obligatorio." };

  const url = validation.url;
  const existingUtmParams = UTM_KEYS.filter((key) => url.searchParams.has(key));

  url.searchParams.set("utm_source", params.source.trim());
  url.searchParams.set("utm_medium", params.medium.trim());
  url.searchParams.set("utm_campaign", params.campaign.trim());
  if (params.term?.trim()) url.searchParams.set("utm_term", params.term.trim());
  if (params.content?.trim()) url.searchParams.set("utm_content", params.content.trim());

  return { ok: true, finalUrl: url.toString(), existingUtmParams };
}

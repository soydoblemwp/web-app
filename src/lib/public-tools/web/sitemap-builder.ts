export interface SitemapUrlEntry {
  url: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

export interface SitemapFinding {
  index: number;
  field: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
}

const VALID_CHANGEFREQ = ["", "always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Splits raw pasted text (one URL per line) or a simple TXT/CSV import into candidate URL strings — never fetches or crawls anything (spec section 13: "no rastree automáticamente el sitio"). */
export function parseUrlList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim() ?? "")
    .filter(Boolean);
}

export function findDuplicateUrls(entries: SitemapUrlEntry[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  entries.forEach((entry, index) => {
    const normalized = entry.url.trim();
    if (seen.has(normalized)) duplicates.add(index);
    else seen.set(normalized, index);
  });
  return duplicates;
}

export function validateSitemapEntries(entries: SitemapUrlEntry[], hostname: string | null): SitemapFinding[] {
  const findings: SitemapFinding[] = [];
  const duplicates = findDuplicateUrls(entries);

  entries.forEach((entry, index) => {
    if (!entry.url.trim()) {
      findings.push({ index, field: "url", severity: "ERROR", message: "La URL está vacía." });
      return;
    }
    if (!isHttpUrl(entry.url)) {
      findings.push({ index, field: "url", severity: "ERROR", message: "No es una URL absoluta http/https válida." });
      return;
    }
    if (duplicates.has(index)) findings.push({ index, field: "url", severity: "WARNING", message: "URL duplicada." });
    if (hostname) {
      try {
        if (new URL(entry.url).hostname !== hostname) findings.push({ index, field: "url", severity: "INFO", message: `La URL pertenece a un host distinto de "${hostname}".` });
      } catch {
        /* already flagged above */
      }
    }
    if (entry.lastmod && !ISO_DATE_PATTERN.test(entry.lastmod)) findings.push({ index, field: "lastmod", severity: "ERROR", message: "lastmod debe ser una fecha ISO 8601 (AAAA-MM-DD)." });
    if (entry.changefreq && !VALID_CHANGEFREQ.includes(entry.changefreq)) findings.push({ index, field: "changefreq", severity: "ERROR", message: "changefreq no es uno de los valores admitidos." });
    if (entry.priority) {
      const value = Number(entry.priority);
      if (Number.isNaN(value) || value < 0 || value > 1) findings.push({ index, field: "priority", severity: "ERROR", message: "priority debe ser un número entre 0.0 y 1.0." });
    }
  });

  return findings;
}

export function buildSitemapXml(entries: SitemapUrlEntry[]): string {
  const urlBlocks = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url.trim())}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
      if (entry.priority) parts.push(`    <priority>${escapeXml(entry.priority)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlBlocks}\n</urlset>\n`;
}

export function buildSitemapIndexXml(sitemapUrls: string[]): string {
  const blocks = sitemapUrls.map((url) => `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n  </sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks}\n</sitemapindex>\n`;
}

/** Splits entries into chunks of at most `maxPerFile` — the real sitemap protocol limit is 50,000 URLs per file; the tool's own configured limit (spec section 13: "límite central razonable para navegador") is typically far lower for browser memory reasons. */
export function splitSitemapEntries(entries: SitemapUrlEntry[], maxPerFile: number): SitemapUrlEntry[][] {
  const chunks: SitemapUrlEntry[][] = [];
  for (let i = 0; i < entries.length; i += maxPerFile) chunks.push(entries.slice(i, i + maxPerFile));
  return chunks;
}

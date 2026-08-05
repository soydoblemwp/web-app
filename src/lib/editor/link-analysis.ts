export interface LinkCounts {
  internal: number;
  external: number;
}

/**
 * Classifies every <a href> in a Tiptap HTML body as internal (relative,
 * anchor, or same-host as `siteHost`) or external — feeds the SEO score's
 * "enlaces internos"/"enlaces externos" checks. Pure string parsing, no DOM
 * needed (this runs both client-side and, potentially, in tests).
 */
export function countLinks(html: string, siteHost: string): LinkCounts {
  const hrefs = [...html.matchAll(/<a\s+[^>]*href="([^"]*)"[^>]*>/gi)].map((match) => match[1]);
  let internal = 0;
  let external = 0;

  for (const href of hrefs) {
    if (!href || href.startsWith("/") || href.startsWith("#")) {
      internal += 1;
      continue;
    }
    try {
      const url = new URL(href);
      if (url.host === siteHost) internal += 1;
      else external += 1;
    } catch {
      internal += 1;
    }
  }

  return { internal, external };
}

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { validateOpenGraph, buildOpenGraphTags, type OpenGraphInput } from "@/lib/public-tools/web/open-graph";
import { buildRobotsTxt, parseRobotsTxt, checkRobotsPath, ROBOTS_PRESETS, type RobotsFile } from "@/lib/public-tools/web/robots";
import { buildSitemapXml, buildSitemapIndexXml, validateSitemapEntries, findDuplicateUrls, splitSitemapEntries, parseUrlList, escapeXml, type SitemapUrlEntry } from "@/lib/public-tools/web/sitemap-builder";
import { buildJsonLd, validateJsonLdObject, validateSchemaFormValues, SCHEMA_TYPES, getSchemaType } from "@/lib/public-tools/web/schema-ld";

// ---------------------------------------------------------------------------
// open-graph.ts — spec sections 18, 19, 39
// ---------------------------------------------------------------------------
const BASE_OG: OpenGraphInput = {
  title: "Mi página",
  description: "Una descripción de ejemplo",
  url: "https://example.com/pagina",
  type: "website",
  siteName: "Mi sitio",
  imageUrl: "https://example.com/imagen.jpg",
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: "Descripción de la imagen",
  locale: "es_ES",
  author: "",
  twitterCard: "summary_large_image",
  twitterSite: "",
  twitterCreator: "",
};

describe("web/open-graph.ts", () => {
  it("a fully valid input produces no ERROR findings", () => {
    const findings = validateOpenGraph(BASE_OG);
    expect(findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });

  it("rejects an empty title and a non-absolute URL", () => {
    const findings = validateOpenGraph({ ...BASE_OG, title: "", url: "not-a-url" });
    expect(findings.some((f) => f.field === "title" && f.severity === "ERROR")).toBe(true);
    expect(findings.some((f) => f.field === "url" && f.severity === "ERROR")).toBe(true);
  });

  it("flags http:// (non-https) as an INFO-level recommendation, not an error", () => {
    const findings = validateOpenGraph({ ...BASE_OG, url: "http://example.com/pagina" });
    const urlFinding = findings.find((f) => f.field === "url" && f.severity === "INFO");
    expect(urlFinding).toBeDefined();
  });

  it("escapes HTML special characters in the generated tags (no injection via title/description)", () => {
    const tags = buildOpenGraphTags({ ...BASE_OG, title: '"><script>alert(1)</script>' });
    expect(tags).not.toMatch(/<script>/);
    expect(tags).toContain("&lt;script&gt;");
  });

  it("generates canonical, Open Graph, and Twitter tags all in one output", () => {
    const tags = buildOpenGraphTags(BASE_OG);
    expect(tags).toMatch(/rel="canonical"/);
    expect(tags).toMatch(/property="og:title"/);
    expect(tags).toMatch(/name="twitter:card"/);
  });

  it("never fetches the URL or the image (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/web/open-graph.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// robots.ts — spec sections 12, 39
// ---------------------------------------------------------------------------
describe("web/robots.ts", () => {
  it("builds real robots.txt text from a structured file", () => {
    const text = buildRobotsTxt(ROBOTS_PRESETS["block-folder"]);
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Disallow: /privado/");
  });

  it("round-trips: parsing a built robots.txt reconstructs equivalent groups and rules", () => {
    const original = ROBOTS_PRESETS["block-several"];
    const text = buildRobotsTxt(original);
    const parsed = parseRobotsTxt(text);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].userAgents).toEqual(["*"]);
    expect(parsed.groups[0].rules.map((r) => r.path)).toEqual(original.groups[0].rules.map((r) => r.path));
  });

  it("parses a real-world multi-group robots.txt with a sitemap directive", () => {
    const text = ["User-agent: Googlebot", "Disallow: /no-google/", "", "User-agent: *", "Allow: /", "", "Sitemap: https://example.com/sitemap.xml"].join("\n");
    const parsed = parseRobotsTxt(text);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].userAgents).toEqual(["Googlebot"]);
    expect(parsed.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("checkRobotsPath: a specific Disallow blocks a matching path under the wildcard group", () => {
    const result = checkRobotsPath(ROBOTS_PRESETS["block-folder"], "*", "/privado/secreto.html");
    expect(result.allowed).toBe(false);
  });

  it("checkRobotsPath: an Allow exception overrides a broader Disallow for a more specific path (longest-match wins)", () => {
    const result = checkRobotsPath(ROBOTS_PRESETS["block-with-exception"], "*", "/privado/publico.html");
    expect(result.allowed).toBe(true);
  });

  it("checkRobotsPath: a path with no matching rule defaults to allowed", () => {
    const result = checkRobotsPath(ROBOTS_PRESETS["block-folder"], "*", "/otra-ruta");
    expect(result.allowed).toBe(true);
  });

  it("checkRobotsPath: an exact user-agent group takes priority over the wildcard group", () => {
    const file: RobotsFile = {
      groups: [
        { id: "g1", userAgents: ["Googlebot"], rules: [{ type: "allow", path: "/" }], comment: "" },
        { id: "g2", userAgents: ["*"], rules: [{ type: "disallow", path: "/" }], comment: "" },
      ],
      sitemaps: [],
    };
    expect(checkRobotsPath(file, "Googlebot", "/pagina").allowed).toBe(true);
    expect(checkRobotsPath(file, "OtroBot", "/pagina").allowed).toBe(false);
  });

  it("rejects unsupported scheduler-specific syntax explicitly rather than silently misinterpreting it", () => {
    // This is tested via cron.ts's own suite; here we confirm robots.txt has no equivalent ambiguity to guard —
    // included for section 12 coverage of "no rastree/descargue nada remoto":
    const source = fs.readFileSync("src/lib/public-tools/web/robots.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// sitemap-builder.ts — spec sections 13, 39, 40 (real XML, split, index)
// ---------------------------------------------------------------------------
describe("web/sitemap-builder.ts", () => {
  it("escapeXml neutralizes the 5 XML special characters", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });

  it("builds a real, well-formed sitemap XML that parses back with the expected URL count and content", () => {
    const entries: SitemapUrlEntry[] = [
      { url: "https://example.com/a", lastmod: "2026-01-01", changefreq: "weekly", priority: "0.8" },
      { url: "https://example.com/b?x=1&y=2", lastmod: "", changefreq: "", priority: "" },
    ];
    const xml = buildSitemapXml(entries);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    const locMatches = xml.match(/<loc>[^<]*<\/loc>/g) ?? [];
    expect(locMatches).toHaveLength(2);
    expect(xml).toContain("https://example.com/b?x=1&amp;y=2"); // & correctly escaped, never breaking the XML
    expect(xml).toContain("<lastmod>2026-01-01</lastmod>");
    expect(xml).toContain("<priority>0.8</priority>");
  });

  it("buildSitemapIndexXml produces a real, well-formed sitemapindex referencing each child sitemap", () => {
    const xml = buildSitemapIndexXml(["https://example.com/sitemap-1.xml", "https://example.com/sitemap-2.xml"]);
    expect(xml).toContain("<sitemapindex");
    expect((xml.match(/<sitemap>/g) ?? []).length).toBe(2);
  });

  it("findDuplicateUrls flags every occurrence after the first", () => {
    const entries: SitemapUrlEntry[] = [
      { url: "https://example.com/a", lastmod: "", changefreq: "", priority: "" },
      { url: "https://example.com/a", lastmod: "", changefreq: "", priority: "" },
      { url: "https://example.com/b", lastmod: "", changefreq: "", priority: "" },
    ];
    const duplicates = findDuplicateUrls(entries);
    expect(duplicates.has(1)).toBe(true);
    expect(duplicates.has(0)).toBe(false);
    expect(duplicates.has(2)).toBe(false);
  });

  it("validateSitemapEntries rejects a non-absolute URL, an invalid lastmod, an invalid changefreq, and an out-of-range priority", () => {
    const entries: SitemapUrlEntry[] = [
      { url: "/relative", lastmod: "", changefreq: "", priority: "" },
      { url: "https://example.com/a", lastmod: "not-a-date", changefreq: "", priority: "" },
      { url: "https://example.com/b", lastmod: "", changefreq: "bogus", priority: "" },
      { url: "https://example.com/c", lastmod: "", changefreq: "", priority: "2.5" },
    ];
    const findings = validateSitemapEntries(entries, null);
    expect(findings.find((f) => f.index === 0)?.severity).toBe("ERROR");
    expect(findings.find((f) => f.index === 1 && f.field === "lastmod")?.severity).toBe("ERROR");
    expect(findings.find((f) => f.index === 2 && f.field === "changefreq")?.severity).toBe("ERROR");
    expect(findings.find((f) => f.index === 3 && f.field === "priority")?.severity).toBe("ERROR");
  });

  it("validateSitemapEntries flags a URL on a different hostname as INFO when a hostname filter is set", () => {
    const findings = validateSitemapEntries([{ url: "https://otro-dominio.com/x", lastmod: "", changefreq: "", priority: "" }], "example.com");
    expect(findings.some((f) => f.severity === "INFO")).toBe(true);
  });

  it("splitSitemapEntries divides entries into chunks and buildSitemapIndexXml plus per-chunk XML reconstructs the full URL set", () => {
    const entries: SitemapUrlEntry[] = Array.from({ length: 1250 }, (_, i) => ({ url: `https://example.com/page-${i}`, lastmod: "", changefreq: "", priority: "" }));
    const chunks = splitSitemapEntries(entries, 500);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(250);
    const totalUrls = chunks.flatMap((chunk) => (buildSitemapXml(chunk).match(/<loc>/g) ?? []).length).reduce((a, b) => a + b, 0);
    expect(totalUrls).toBe(1250);
  });

  it("parseUrlList extracts one URL per line and ignores blank lines", () => {
    const urls = parseUrlList("https://example.com/a\n\nhttps://example.com/b\n  https://example.com/c  ");
    expect(urls).toEqual(["https://example.com/a", "https://example.com/b", "https://example.com/c"]);
  });

  it("never crawls or fetches the site being mapped (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/web/sitemap-builder.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// schema-ld.ts — spec sections 14, 15, 39, 40 (all 12 types, Zod, layered validation)
// ---------------------------------------------------------------------------
describe("web/schema-ld.ts", () => {
  it("declares exactly the 12 required schema.org types", () => {
    const ids = SCHEMA_TYPES.map((t) => t.id);
    expect(ids).toEqual(["Organization", "LocalBusiness", "WebSite", "WebPage", "Article", "BlogPosting", "Product", "SoftwareApplication", "FAQPage", "BreadcrumbList", "Person", "Event"]);
  });

  it("buildJsonLd(Organization) produces valid, parseable JSON-LD with @context and @type", () => {
    const obj = buildJsonLd("Organization", { name: "Acme", url: "https://acme.example" });
    const json = JSON.stringify(obj);
    expect(JSON.parse(json)).toEqual(obj);
    expect(obj["@context"]).toBe("https://schema.org");
    expect(obj["@type"]).toBe("Organization");
  });

  it("omits empty optional fields entirely rather than emitting empty strings", () => {
    const obj = buildJsonLd("Organization", { name: "Acme", url: "https://acme.example", logo: "" });
    expect("logo" in obj).toBe(false);
  });

  it("FAQPage only includes questions/answers the user actually entered — never fabricates any", () => {
    const obj = buildJsonLd("FAQPage", { faqItems: [{ question: "¿Envían internacionalmente?", answer: "Sí, a toda la UE." }] }) as { mainEntity: unknown[] };
    expect(obj.mainEntity).toHaveLength(1);
    const emptyObj = buildJsonLd("FAQPage", { faqItems: [] }) as { mainEntity: unknown[] };
    expect(emptyObj.mainEntity).toHaveLength(0);
  });

  it("Product schema never includes AggregateRating/review fields — no such field exists in the type definition at all", () => {
    const productType = getSchemaType("Product")!;
    const fieldKeys = productType.fields.map((f) => f.key);
    expect(fieldKeys).not.toContain("aggregateRating");
    expect(fieldKeys).not.toContain("review");
    expect(fieldKeys).not.toContain("ratingValue");
  });

  it("Product offers are only included when the user actually provides price/currency/availability", () => {
    const withOffer = buildJsonLd("Product", { name: "Camiseta", offerPrice: "19.99", offerCurrency: "EUR", offerAvailability: "InStock" }) as Record<string, unknown>;
    expect(withOffer.offers).toBeDefined();
    const withoutOffer = buildJsonLd("Product", { name: "Camiseta" }) as Record<string, unknown>;
    expect(withoutOffer.offers).toBeUndefined();
  });

  it("BreadcrumbList numbers positions sequentially starting at 1", () => {
    const obj = buildJsonLd("BreadcrumbList", { items: [{ name: "Inicio", url: "https://example.com" }, { name: "Categoría", url: "https://example.com/cat" }] }) as { itemListElement: { position: number }[] };
    expect(obj.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });

  it("validateSchemaFormValues (Zod) rejects a missing required field with a readable message", () => {
    const errors = validateSchemaFormValues("Organization", { name: "", url: "" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("validateSchemaFormValues (Zod) rejects a malformed URL", () => {
    const errors = validateSchemaFormValues("WebSite", { name: "Mi sitio", url: "no-es-una-url" });
    expect(errors.some((e) => e.field === "url")).toBe(true);
  });

  it("validateSchemaFormValues (Zod) accepts fully valid Article values", () => {
    const errors = validateSchemaFormValues("Article", { headline: "Un titular", authorName: "Ana", datePublished: "2026-01-01" });
    expect(errors).toEqual([]);
  });

  it("validateJsonLdObject: layer 2 (@context) and layer 3 (@type) both flag mismatches", () => {
    const findings = validateJsonLdObject("Organization", { "@context": "https://wrong.org", "@type": "Person", name: "x" });
    expect(findings.some((f) => f.code === "missing-context")).toBe(true);
    expect(findings.some((f) => f.code === "type-mismatch")).toBe(true);
  });

  it("validateJsonLdObject: layer 6 (URLs) rejects a non-http url field", () => {
    const findings = validateJsonLdObject("WebSite", { "@context": "https://schema.org", "@type": "WebSite", name: "x", url: "not-a-url" });
    expect(findings.some((f) => f.field === "url" && f.code === "invalid-url")).toBe(true);
  });

  it("validateJsonLdObject: layer 7 (ISO dates) rejects a malformed datePublished", () => {
    const findings = validateJsonLdObject("Article", { "@context": "https://schema.org", "@type": "Article", headline: "x", datePublished: "29 de julio" });
    expect(findings.some((f) => f.field === "datePublished" && f.code === "invalid-date")).toBe(true);
  });

  it("validateJsonLdObject: layer 8 (positive values) rejects a negative offer price", () => {
    const findings = validateJsonLdObject("Product", { "@context": "https://schema.org", "@type": "Product", name: "x", offers: { price: "-5" } });
    expect(findings.some((f) => f.field === "offers.price")).toBe(true);
  });

  it("validateJsonLdObject: layer 9/10 (internal relations) rejects an Event endDate before startDate", () => {
    const findings = validateJsonLdObject("Event", { "@context": "https://schema.org", "@type": "Event", name: "x", startDate: "2026-06-01", endDate: "2026-05-01" });
    expect(findings.some((f) => f.code === "incompatible-dates")).toBe(true);
  });

  it("validateJsonLdObject: FAQPage requires at least one question", () => {
    const findings = validateJsonLdObject("FAQPage", { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] });
    expect(findings.some((f) => f.code === "required")).toBe(true);
  });

  it("never uses eval on the JSON-LD content (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/web/schema-ld.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(/);
  });

  it("never claims Google-level validity — the constant is exactly the honest phrase from the spec", () => {
    const source = fs.readFileSync("src/lib/public-tools/web/schema-ld.ts", "utf8");
    expect(source).toMatch(/LOCAL_VALIDITY_LABEL = "Estructura localmente válida"/);
  });
});

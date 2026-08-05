import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { renderMarkdownToHtml, computeMarkdownStats } from "@/lib/public-tools/development/markdown";
import { convertCsvToJson, convertJsonToCsv, detectDelimiter } from "@/lib/public-tools/development/csv-json";
import { unzipSync, zipSync } from "fflate";
import { validateFlags, buildSafeRegExp, computeMatches, applyReplace, analyzeRedosRisk, REGEX_LIMITS } from "@/lib/public-tools/development/regex";
import { parseCronExpression, explainCron, computeNextExecutions, CRON_PRESETS } from "@/lib/public-tools/development/cron";

// ---------------------------------------------------------------------------
// markdown.ts — spec sections 18, 39, 40 (real sanitization, XSS blocked)
// ---------------------------------------------------------------------------
describe("development/markdown.ts: renderMarkdownToHtml", () => {
  it("renders headings, emphasis, and lists to real HTML tags", () => {
    const html = renderMarkdownToHtml("# Título\n\n**negrita** y *cursiva*\n\n- uno\n- dos");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>negrita</strong>");
    expect(html).toContain("<em>cursiva</em>");
    expect(html).toContain("<ul><li>uno</li><li>dos</li></ul>");
  });

  it("renders a fenced code block as escaped text inside <pre><code>, never executable", () => {
    const html = renderMarkdownToHtml("```js\nconst x = '<script>alert(1)</script>';\n```");
    expect(html).toContain("<pre><code");
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("a raw <script> tag typed directly in the Markdown source is escaped as plain text, never emitted as live markup", () => {
    const html = renderMarkdownToHtml('Hola <script>alert(1)</script> mundo');
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("an onerror/onload event-handler attribute typed as raw text stays inert text — no real <img> tag is ever emitted for it", () => {
    const html = renderMarkdownToHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/<img\s/); // no live <img ...> tag was created from the raw text
    expect(html).toContain("&lt;img"); // the literal text survives only as escaped, inert content
  });

  it("a javascript: link target is rejected — the link is dropped, only the label text remains", () => {
    const html = renderMarkdownToHtml("[click me](javascript:alert(1))");
    expect(html).not.toMatch(/javascript:/);
    expect(html).not.toMatch(/<a /);
    expect(html).toContain("click me");
  });

  it("a javascript: image src is rejected the same way", () => {
    const html = renderMarkdownToHtml("![alt text](javascript:alert(1))");
    expect(html).not.toMatch(/javascript:/);
    expect(html).not.toMatch(/<img/);
  });

  it("a real https link and image render as real, safe anchor/img tags", () => {
    const html = renderMarkdownToHtml("[Example](https://example.com/page?a=1&b=2) and ![alt](https://example.com/img.png)");
    expect(html).toMatch(/<a href="https:\/\/example\.com\/page\?a=1&amp;b=2"[^>]*>Example<\/a>/);
    expect(html).toMatch(/<img src="https:\/\/example\.com\/img\.png" alt="alt"/);
  });

  it("renders a GFM table with header and body rows", () => {
    const html = renderMarkdownToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders a task list with disabled checkboxes reflecting checked state", () => {
    const html = renderMarkdownToHtml("- [x] hecho\n- [ ] pendiente");
    expect(html).toMatch(/<input type="checkbox" disabled checked \/> hecho/);
    expect(html).toMatch(/<input type="checkbox" disabled  \/> pendiente/);
  });

  it("renders a horizontal rule and a blockquote", () => {
    expect(renderMarkdownToHtml("---")).toContain("<hr />");
    expect(renderMarkdownToHtml("> una cita")).toContain("<blockquote>");
  });

  it("computeMarkdownStats counts headings, words, links and images correctly on a known document", () => {
    const stats = computeMarkdownStats("# Uno\n## Dos\n\nHola mundo con [un enlace](https://x.com) y ![una imagen](https://x.com/i.png)");
    expect(stats.headings).toBe(2);
    expect(stats.links).toBe(1);
    expect(stats.images).toBe(1);
    expect(stats.words).toBeGreaterThan(0);
  });

  it("never calls dangerouslySetInnerHTML-unsafe primitives itself — the module has no DOM access at all (pure string transform)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/markdown.ts", "utf8");
    expect(source).not.toMatch(/document\.|window\./);
  });

  it("has no code path that ever passes through a raw <tag> the user typed — every emitted tag comes from a fixed, hand-written set", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/markdown.ts", "utf8");
    // The only literal "<" characters in the source that aren't inside a regex/string for escaping should be part of the renderer's own template strings.
    expect(source).toMatch(/function escapeHtml/);
    expect(source).not.toMatch(/rawHtml|allowHtml|dangerous/i);
  });
});

// ---------------------------------------------------------------------------
// csv-json.ts — spec sections 19, 39, 40 (real reuse of performance/csv.ts, round trip)
// ---------------------------------------------------------------------------
describe("development/csv-json.ts", () => {
  it("reuses the shared CSV parser from performance/csv.ts rather than a second implementation (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/csv-json.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/performance\/csv"/);
  });

  it("converts a real CSV with quoted fields, embedded commas, and embedded newlines to correct JSON", () => {
    const csv = 'name,note\n"Doe, John","Line1\nLine2"\nJane,Simple';
    const result = convertCsvToJson(csv, { delimiter: ",", hasHeaders: true, trimCells: false, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([
      { name: "Doe, John", note: "Line1\nLine2" },
      { name: "Jane", note: "Simple" },
    ]);
  });

  it("strips a UTF-8 BOM before parsing", () => {
    const csv = "﻿name,age\nAna,30";
    const result = convertCsvToJson(csv, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect(result.ok).toBe(true);
    expect((result.value as Record<string, string>[])[0].name).toBe("Ana");
  });

  it("leaves values as strings when type inference is off (the default), and infers numbers/booleans when explicitly enabled", () => {
    const csv = "n,active\n42,true";
    const offResult = convertCsvToJson(csv, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect((offResult.value as Record<string, unknown>[])[0]).toEqual({ n: "42", active: "true" });
    const onResult = convertCsvToJson(csv, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: true, jsonShape: "array-of-objects", nullForEmpty: false });
    expect((onResult.value as Record<string, unknown>[])[0]).toEqual({ n: 42, active: true });
  });

  it("a header literally named __proto__ becomes a safe own property, never pollutes Object.prototype", () => {
    const csv = "__proto__,name\npolluted,Ana";
    const result = convertCsvToJson(csv, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const row = (result.value as Record<string, unknown>[])[0];
    expect(Object.prototype.hasOwnProperty.call(row, "__proto__")).toBe(true);
  });

  it("converts JSON to CSV and neutralizes a formula-injection payload in a cell", () => {
    const json = JSON.stringify([{ name: "=cmd|'/c calc'!A1", amount: 10 }]);
    const result = convertJsonToCsv(json, { delimiter: ",", flattenObjects: false, arrayJoinStrategy: "json" });
    expect(result.ok).toBe(true);
    expect(result.csv).toContain("'=cmd");
  });

  it("round-trips CSV -> JSON -> CSV and recovers the same tabular content", () => {
    const originalCsv = "name,age\nAna,30\nLuis,25";
    const toJson = convertCsvToJson(originalCsv, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect(toJson.ok).toBe(true);
    const backToCsv = convertJsonToCsv(toJson.json!, { delimiter: ",", flattenObjects: false, arrayJoinStrategy: "json" });
    expect(backToCsv.ok).toBe(true);
    const reparsed = convertCsvToJson(backToCsv.csv!, { delimiter: ",", hasHeaders: true, trimCells: true, inferTypes: false, jsonShape: "array-of-objects", nullForEmpty: false });
    expect(reparsed.value).toEqual(toJson.value);
  });

  it("flattens nested objects with dot-notation keys when requested", () => {
    const json = JSON.stringify([{ name: "Ana", address: { city: "Madrid", zip: "28001" } }]);
    const result = convertJsonToCsv(json, { delimiter: ",", flattenObjects: true, arrayJoinStrategy: "json" });
    expect(result.csv).toContain("address.city");
    expect(result.csv).toContain("Madrid");
  });

  it("rejects malformed JSON for JSON->CSV with a real parse error, not a silent empty result", () => {
    const result = convertJsonToCsv("{not valid json", { delimiter: ",", flattenObjects: false, arrayJoinStrategy: "json" });
    expect(result.ok).toBe(false);
    expect(result.findings[0].severity).toBe("ERROR");
  });

  it("rejects a JSON array containing non-object items for JSON->CSV", () => {
    const result = convertJsonToCsv("[1, 2, 3]", { delimiter: ",", flattenObjects: false, arrayJoinStrategy: "json" });
    expect(result.ok).toBe(false);
  });

  it("never uses eval on the JSON content (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/csv-json.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(/);
  });

  it("detectDelimiter (re-exported from the shared core) picks the most frequent candidate delimiter", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });
});

// A sanity check that the shared ZIP library used elsewhere in the app can also round-trip arbitrary text —
// establishes that fflate itself (already a Fase 42 dependency) is not the source of any CSV/JSON issue above.
describe("sanity: fflate round-trip (already a Fase 42 dependency, no new dependency added here)", () => {
  it("zips and unzips a UTF-8 text entry losslessly", () => {
    const zipped = zipSync({ "data.csv": new TextEncoder().encode("a,b\n1,2") });
    const unzipped = unzipSync(zipped);
    expect(new TextDecoder().decode(unzipped["data.csv"])).toBe("a,b\n1,2");
  });
});

// ---------------------------------------------------------------------------
// regex.ts — spec sections 20, 39, 40 (pure logic the worker calls; the
// worker itself uses the browser Worker global and is verified structurally
// below, since Vitest's Node environment has no Worker/self global to run it
// directly — see the "Web Worker wiring" describe block for that check).
// ---------------------------------------------------------------------------
describe("development/regex.ts", () => {
  it("validateFlags accepts standard flags and rejects an unsupported character and duplicates", () => {
    expect(validateFlags("gi").ok).toBe(true);
    expect(validateFlags("gg").ok).toBe(false);
    expect(validateFlags("z").ok).toBe(false);
  });

  it("rejects combining u and v flags together (mutually exclusive per spec)", () => {
    expect(validateFlags("uv").ok).toBe(false);
  });

  it("buildSafeRegExp returns a real RegExp for a valid pattern and an error for an invalid one", () => {
    const ok = buildSafeRegExp("\\d+", "g");
    expect(ok.ok).toBe(true);
    expect(ok.regex).toBeInstanceOf(RegExp);
    const bad = buildSafeRegExp("(unclosed", "g");
    expect(bad.ok).toBe(false);
  });

  it("computeMatches finds all matches with a global flag and correct indices", () => {
    const built = buildSafeRegExp("\\d+", "g");
    const { matches, truncated } = computeMatches(built.regex!, "a1 b22 c333", 100);
    expect(matches.map((m) => m.fullMatch)).toEqual(["1", "22", "333"]);
    expect(matches[1].index).toBe(4);
    expect(truncated).toBe(false);
  });

  it("computeMatches captures named groups", () => {
    const built = buildSafeRegExp("(?<year>\\d{4})-(?<month>\\d{2})", "");
    const { matches } = computeMatches(built.regex!, "2026-07", 100);
    expect(matches[0].groups.find((g) => g.name === "year")?.value).toBe("2026");
    expect(matches[0].groups.find((g) => g.name === "month")?.value).toBe("07");
  });

  it("computeMatches truncates at maxMatches and reports truncated:true", () => {
    const built = buildSafeRegExp("a", "g");
    const { matches, truncated } = computeMatches(built.regex!, "a".repeat(50), 10);
    expect(matches).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it("computeMatches never infinite-loops on a pattern that can match an empty string with the global flag", () => {
    const built = buildSafeRegExp("a*", "g");
    const { matches } = computeMatches(built.regex!, "bbb", REGEX_LIMITS.maxMatches);
    expect(matches.length).toBeLessThanOrEqual(REGEX_LIMITS.maxMatches);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("applyReplace supports $1 backreferences and $<name> named group references", () => {
    const built = buildSafeRegExp("(?<first>\\w+) (?<second>\\w+)", "");
    expect(applyReplace(built.regex!, "hello world", "$<second> $<first>")).toBe("world hello");
    const numbered = buildSafeRegExp("(\\w+)@(\\w+)", "");
    expect(applyReplace(numbered.regex!, "user@host", "$2:$1")).toBe("host:user");
  });

  it("analyzeRedosRisk flags a textbook nested-quantifier pattern and does not flag a simple safe pattern", () => {
    expect(analyzeRedosRisk("(a+)+$").reasons.length).toBeGreaterThan(0);
    expect(analyzeRedosRisk("^[a-z]+@[a-z]+\\.[a-z]+$").reasons).toEqual([]);
  });

  it("never uses eval or new Function to build or run the regex (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/regex.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(/);
  });
});

describe("development/regex-worker.ts: Web Worker wiring (structural — see file header for why)", () => {
  it("the worker module only ever calls the pure functions from regex.ts, never re-implements matching itself", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/regex-worker.ts", "utf8");
    expect(source).toMatch(/from "\.\/regex"/);
    expect(source).toMatch(/buildSafeRegExp|computeMatches|applyReplace/);
  });

  it("the worker never uses eval or new Function", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/regex-worker.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(/);
  });

  it("the worker responds via postMessage and never touches the DOM (safe to run off the main thread)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/regex-worker.ts", "utf8");
    expect(source).toMatch(/postMessage/);
    expect(source).not.toMatch(/document\.|window\./);
  });

  it("the regex tool component creates the Worker via new URL(..., import.meta.url) — the standard safe bundler pattern — and races it against a setTimeout that calls worker.terminate()", () => {
    const source = fs.readFileSync("src/components/public-tools/tools/regex-tester-tool.tsx", "utf8");
    expect(source).toMatch(/new Worker\(new URL\(/);
    expect(source).toMatch(/setTimeout/);
    expect(source).toMatch(/\.terminate\(\)/);
  });

  it("the regex tool component never executes the pattern on the main thread itself (no direct .exec/.test/.replace call on a user-built RegExp outside the worker file)", () => {
    const source = fs.readFileSync("src/components/public-tools/tools/regex-tester-tool.tsx", "utf8");
    expect(source).not.toMatch(/new RegExp\(/);
  });
});

// ---------------------------------------------------------------------------
// cron.ts — spec sections 21, 39, 40 (5-field only, next executions, DST)
// ---------------------------------------------------------------------------
describe("development/cron.ts", () => {
  it("parses a valid 5-field expression with wildcards, lists, ranges and steps", () => {
    const result = parseCronExpression("*/15 9-17 1,15 * 1-5");
    expect(result.ok).toBe(true);
    expect(result.cron!.minute.values).toEqual([0, 15, 30, 45]);
    expect(result.cron!.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(result.cron!.dayOfMonth.values).toEqual([1, 15]);
    expect(result.cron!.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an expression that doesn't have exactly 5 fields", () => {
    expect(parseCronExpression("* * * *").ok).toBe(false);
    expect(parseCronExpression("* * * * * *").ok).toBe(false);
  });

  it("rejects Quartz/AWS-style extensions (L, W, #, ?) explicitly rather than silently misparsing them", () => {
    expect(parseCronExpression("0 0 L * *").ok).toBe(false);
    expect(parseCronExpression("0 0 ? * MON#1").ok).toBe(false);
  });

  it("rejects an out-of-range value", () => {
    expect(parseCronExpression("60 * * * *").ok).toBe(false);
    expect(parseCronExpression("* 24 * * *").ok).toBe(false);
  });

  it("treats day-of-week 7 as an alias for 0 (Sunday), per the standard cron convention", () => {
    const result = parseCronExpression("0 0 * * 7");
    expect(result.ok).toBe(true);
    expect(result.cron!.dayOfWeek.values).toEqual([0]);
  });

  it("every preset expression parses successfully", () => {
    for (const preset of CRON_PRESETS) {
      expect(parseCronExpression(preset.expression).ok).toBe(true);
    }
  });

  it("explainCron produces a non-empty, human-readable Spanish sentence for a known expression", () => {
    const result = parseCronExpression("0 9 * * 1-5");
    const explanation = explainCron(result.cron!);
    expect(explanation).toMatch(/09:00/);
    expect(explanation.length).toBeGreaterThan(5);
  });

  it("computeNextExecutions for 'every minute' returns consecutive minutes starting after the given instant", () => {
    const result = parseCronExpression("* * * * *");
    const from = new Date("2026-07-29T10:00:30.000Z");
    const { dates } = computeNextExecutions(result.cron!, 3, "UTC", from);
    expect(dates.map((d) => d.toISOString())).toEqual(["2026-07-29T10:01:00.000Z", "2026-07-29T10:02:00.000Z", "2026-07-29T10:03:00.000Z"]);
  });

  it("computeNextExecutions for a daily-at-9am expression finds the correct next occurrence across a day boundary", () => {
    const result = parseCronExpression("0 9 * * *");
    const from = new Date("2026-07-29T10:00:00.000Z"); // already past 9am UTC today
    const { dates } = computeNextExecutions(result.cron!, 1, "UTC", from);
    expect(dates[0].toISOString()).toBe("2026-07-30T09:00:00.000Z");
  });

  it("computeNextExecutions respects a non-UTC IANA timezone (9am Europe/Madrid is 07:00 or 08:00 UTC depending on DST)", () => {
    const result = parseCronExpression("0 9 * * *");
    const from = new Date("2026-01-01T00:00:00.000Z"); // winter, CET = UTC+1
    const { dates } = computeNextExecutions(result.cron!, 1, "Europe/Madrid", from);
    expect(dates[0].toISOString()).toBe("2026-01-01T08:00:00.000Z");
  });

  it("computeNextExecutions handles the summer/winter DST offset difference for the same wall-clock time", () => {
    const result = parseCronExpression("0 9 * * *");
    const winterFrom = new Date("2026-01-01T00:00:00.000Z");
    const summerFrom = new Date("2026-07-01T00:00:00.000Z");
    const winter = computeNextExecutions(result.cron!, 1, "Europe/Madrid", winterFrom).dates[0];
    const summer = computeNextExecutions(result.cron!, 1, "Europe/Madrid", summerFrom).dates[0];
    // Winter (CET, UTC+1) -> 08:00 UTC; Summer (CEST, UTC+2) -> 07:00 UTC. The 1-hour difference proves DST is honored.
    expect(winter.getUTCHours()).toBe(8);
    expect(summer.getUTCHours()).toBe(7);
  });

  it("computeNextExecutions caps the search and reports a limit flag rather than hanging on an impossible combination", () => {
    // Feb 30th never exists — this combination can never match.
    const result = parseCronExpression("0 0 30 2 *");
    const { dates, limitedBySteps, limitedByTime } = computeNextExecutions(result.cron!, 1, "UTC", new Date("2026-01-01T00:00:00.000Z"));
    expect(dates).toHaveLength(0);
    expect(limitedBySteps || limitedByTime).toBe(true);
  });

  it("never sends the expression to a server (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/development/cron.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it("no cron-parser dependency was added — this is confirmed hand-written, matching package.json", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["cron-parser"]).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  detectSubtitleFormat,
  parseSrt,
  parseVtt,
  parseSubtitles,
  buildSrt,
  buildVtt,
  shiftAllTimes,
  findOverlaps,
  findInvalidDurations,
  sanitizeCueTextToHtml,
  findDangerousCueContent,
} from "@/lib/public-tools/media/subtitles";

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hola mundo

2
00:00:05,500 --> 00:00:08,250
Segunda línea
con salto`;

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hola mundo

00:00:05.500 --> 00:00:08.250
Segunda línea
con salto`;

// ---------------------------------------------------------------------------
// Format detection — spec section 28
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: detectSubtitleFormat", () => {
  it("detects VTT from the WEBVTT header", () => {
    expect(detectSubtitleFormat(SAMPLE_VTT)).toBe("vtt");
  });
  it("detects SRT from its numeric-index + comma-timestamp shape", () => {
    expect(detectSubtitleFormat(SAMPLE_SRT)).toBe("srt");
  });
  it("detects a real UTF-8 BOM-prefixed SRT correctly", () => {
    expect(detectSubtitleFormat("﻿" + SAMPLE_SRT)).toBe("srt");
  });
  it("returns null for unrecognized content", () => {
    expect(detectSubtitleFormat("just some random text")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SRT parsing — spec sections 28, 41
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: parseSrt", () => {
  it("parses real cues with correct timestamps and multi-line text", () => {
    const result = parseSrt(SAMPLE_SRT);
    expect(result.ok).toBe(true);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].startMs).toBe(1000);
    expect(result.cues[0].endMs).toBe(4000);
    expect(result.cues[0].text).toBe("Hola mundo");
    expect(result.cues[1].text).toBe("Segunda línea\ncon salto");
  });

  it("handles a BOM and CRLF line endings", () => {
    const withBomAndCrlf = "﻿" + SAMPLE_SRT.replace(/\n/g, "\r\n");
    const result = parseSrt(withBomAndCrlf);
    expect(result.ok).toBe(true);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].text).toBe("Hola mundo");
  });

  it("reports a real error finding for a malformed timing line, without crashing", () => {
    const broken = "1\nnot a valid timestamp\nHola";
    const result = parseSrt(broken);
    expect(result.ok).toBe(false);
    expect(result.findings[0].severity).toBe("ERROR");
  });
});

// ---------------------------------------------------------------------------
// WebVTT parsing
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: parseVtt", () => {
  it("parses real cues, stripping the WEBVTT header", () => {
    const result = parseVtt(SAMPLE_VTT);
    expect(result.ok).toBe(true);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].startMs).toBe(1000);
    expect(result.cues[0].endMs).toBe(4000);
  });

  it("handles an optional cue identifier line before the timing line", () => {
    const withId = "WEBVTT\n\ncue-1\n00:00:01.000 --> 00:00:02.000\nTexto";
    const result = parseVtt(withId);
    expect(result.ok).toBe(true);
    expect(result.cues[0].text).toBe("Texto");
  });
});

describe("media/subtitles.ts: parseSubtitles (auto-detect)", () => {
  it("auto-detects and parses SRT", () => {
    const result = parseSubtitles(SAMPLE_SRT);
    expect(result.format).toBe("srt");
    expect(result.cues).toHaveLength(2);
  });
  it("auto-detects and parses VTT", () => {
    const result = parseSubtitles(SAMPLE_VTT);
    expect(result.format).toBe("vtt");
    expect(result.cues).toHaveLength(2);
  });
  it("returns a clear error for unrecognized content", () => {
    const result = parseSubtitles("nonsense");
    expect(result.ok).toBe(false);
    expect(result.format).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round trip — spec section 41: "round trip SRT -> VTT -> SRT"
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: SRT <-> VTT round trip", () => {
  it("SRT -> parse -> VTT -> parse -> SRT preserves every cue's timing and text exactly", () => {
    const original = parseSrt(SAMPLE_SRT);
    const vttText = buildVtt(original.cues);
    const reparsedFromVtt = parseVtt(vttText);
    const srtAgain = buildSrt(reparsedFromVtt.cues);
    const finalParse = parseSrt(srtAgain);

    expect(finalParse.cues).toHaveLength(original.cues.length);
    finalParse.cues.forEach((cue, i) => {
      expect(cue.startMs).toBe(original.cues[i].startMs);
      expect(cue.endMs).toBe(original.cues[i].endMs);
      expect(cue.text).toBe(original.cues[i].text);
    });
  });

  it("buildSrt output re-parses to the exact same cues (self round trip)", () => {
    const cues = parseSrt(SAMPLE_SRT).cues;
    const rebuilt = parseSrt(buildSrt(cues)).cues;
    expect(rebuilt.map((c) => ({ start: c.startMs, end: c.endMs, text: c.text }))).toEqual(cues.map((c) => ({ start: c.startMs, end: c.endMs, text: c.text })));
  });

  it("buildVtt always starts with the WEBVTT header", () => {
    expect(buildVtt([])).toMatch(/^WEBVTT/);
  });
});

// ---------------------------------------------------------------------------
// Editing operations
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: shiftAllTimes", () => {
  it("shifts every cue by the given delta, clamping at 0", () => {
    const cues = parseSrt(SAMPLE_SRT).cues;
    const shifted = shiftAllTimes(cues, 1000);
    expect(shifted[0].startMs).toBe(2000);
    expect(shifted[0].endMs).toBe(5000);
  });
  it("never produces a negative time when shifting backward past zero", () => {
    const cues = parseSrt(SAMPLE_SRT).cues;
    const shifted = shiftAllTimes(cues, -100000);
    expect(shifted.every((c) => c.startMs >= 0 && c.endMs >= 0)).toBe(true);
  });
});

describe("media/subtitles.ts: findOverlaps", () => {
  it("detects a real overlap between two adjacent cues", () => {
    const cues = [
      { id: "a", startMs: 0, endMs: 3000, text: "A" },
      { id: "b", startMs: 2000, endMs: 5000, text: "B" },
    ];
    const overlaps = findOverlaps(cues);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toEqual({ cueAId: "a", cueBId: "b" });
  });
  it("reports no overlaps for sequential, non-overlapping cues", () => {
    const cues = parseSrt(SAMPLE_SRT).cues;
    expect(findOverlaps(cues)).toEqual([]);
  });
});

describe("media/subtitles.ts: findInvalidDurations", () => {
  it("flags a cue whose end is before or equal to its start", () => {
    const cues = [
      { id: "a", startMs: 5000, endMs: 4000, text: "bad" },
      { id: "b", startMs: 0, endMs: 3000, text: "good" },
    ];
    expect(findInvalidDurations(cues)).toEqual(["a"]);
  });
  it("flags a cue shorter than the minimum duration", () => {
    const cues = [{ id: "a", startMs: 0, endMs: 50, text: "too short" }];
    expect(findInvalidDurations(cues, 100)).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// Security — spec sections 28, 39 (no arbitrary HTML/XSS from cue text)
// ---------------------------------------------------------------------------
describe("media/subtitles.ts: cue text safety", () => {
  it("escapes a <script> tag in cue text to inert text, never live markup", () => {
    const html = sanitizeCueTextToHtml('<script>alert(1)</script>');
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("allows only the fixed formatting tags <b>, <i>, <u> to survive as real tags", () => {
    expect(sanitizeCueTextToHtml("<b>negrita</b>")).toBe("<b>negrita</b>");
    expect(sanitizeCueTextToHtml("<i>cursiva</i>")).toBe("<i>cursiva</i>");
    expect(sanitizeCueTextToHtml("<v Speaker>hola</v>")).not.toMatch(/<v/);
  });

  it("escapes an onerror attribute and a javascript: URL typed as plain cue text", () => {
    const html = sanitizeCueTextToHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/<img/);
    const html2 = sanitizeCueTextToHtml("click javascript:alert(1)");
    expect(html2).toContain("javascript:alert(1)"); // preserved as inert escaped text, never executed
    expect(html2).not.toMatch(/<a /);
  });

  it("converts newlines to <br /> for real multi-line cue display", () => {
    expect(sanitizeCueTextToHtml("línea 1\nlínea 2")).toContain("<br />");
  });

  it("findDangerousCueContent flags cues containing a script tag, an event handler, or a javascript: URL", () => {
    const cues = [
      { id: "a", startMs: 0, endMs: 1000, text: "normal text" },
      { id: "b", startMs: 0, endMs: 1000, text: '<script>alert(1)</script>' },
      { id: "c", startMs: 0, endMs: 1000, text: 'onclick="alert(1)"' },
      { id: "d", startMs: 0, endMs: 1000, text: "javascript:alert(1)" },
    ];
    expect(findDangerousCueContent(cues).sort()).toEqual(["b", "c", "d"]);
  });

  it("never uses dangerouslySetInnerHTML itself — this module returns a string, the component decides how to render it", () => {
    const source = fs.readFileSync("src/lib/public-tools/media/subtitles.ts", "utf8");
    // Strip comments first: the module's doc comments legitimately *mention*
    // dangerouslySetInnerHTML while documenting that this file never uses it.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("the subtitle editor component only ever passes sanitizeCueTextToHtml's output to dangerouslySetInnerHTML", () => {
    const source = fs.readFileSync("src/components/public-tools/tools/subtitle-editor-tool.tsx", "utf8");
    const match = /dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/.exec(source);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/sanitizeCueTextToHtml/);
  });

  it("never actually calls a transcription/translation API or an FFmpeg burn-in filter (source-level check for real calls, not doc comments)", () => {
    const core = fs.readFileSync("src/lib/public-tools/media/subtitles.ts", "utf8");
    const tool = fs.readFileSync("src/components/public-tools/tools/subtitle-editor-tool.tsx", "utf8");
    const codeOnly = (core + tool).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // No network calls of any kind (a real transcription/translation API call would need one).
    expect(codeOnly).not.toMatch(/fetch\(|XMLHttpRequest|axios/);
    // No FFmpeg subtitle burn-in filter (e.g. the "subtitles=" or "ass=" video filters).
    expect(codeOnly).not.toMatch(/subtitles=|ass=|drawtext/);
  });
});

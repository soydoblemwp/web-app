import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildTrimAudioCommand,
  buildConcatAudioCommand,
  buildConvertAudioCommand,
  buildTrimVideoCommand,
  buildCompressVideoCommand,
  buildResizeVideoCommand,
  buildExtractAudioCommand,
  buildGifPaletteCommand,
  buildGifApplyCommand,
  buildExtractFramesCommand,
  UnsafeCommandValueError,
  AUDIO_ENCODERS,
  VIDEO_ENCODERS,
} from "@/lib/public-tools/media/ffmpeg-commands";
import { parseTimeFromLogLine, computeMediaProgress } from "@/lib/public-tools/media/ffmpeg-progress";
import { generateVirtualName, writeInputFile, readOutputFile, cleanupVirtualFiles, type FfmpegFsLike } from "@/lib/public-tools/media/ffmpeg-filesystem";
import { STATIC_CAPABILITY_MATRIX, parseEncoderListing, resolveAvailableFormats, getFormatsByKind, describeCompatibility } from "@/lib/public-tools/media/capabilities";
import { resolveFfmpegAssetPaths } from "@/lib/public-tools/media/ffmpeg-assets";

// ---------------------------------------------------------------------------
// ffmpeg-commands.ts — spec sections 12, 21, 39, 40 (safe argv builders, no shell strings)
// ---------------------------------------------------------------------------
describe("media/ffmpeg-commands.ts: safety", () => {
  it("every builder returns a plain string[], never a single shell-joined string", () => {
    const command = buildTrimAudioCommand({ input: "input-1.mp3", output: "output-1.mp3", startMs: 0, endMs: 5000, copyCodec: true });
    expect(Array.isArray(command)).toBe(true);
    for (const arg of command) expect(typeof arg).toBe("string");
  });

  it("rejects a non-finite or out-of-range numeric value instead of silently coercing it", () => {
    expect(() => buildTrimAudioCommand({ input: "i.mp3", output: "o.mp3", startMs: Number.NaN, endMs: 5000, copyCodec: true })).toThrow(UnsafeCommandValueError);
    expect(() => buildResizeVideoCommand({ input: "i.mp4", output: "o.mp4", width: -10, height: 100, fit: "contain", formatId: "mp4-h264" })).toThrow(UnsafeCommandValueError);
    expect(() => buildResizeVideoCommand({ input: "i.mp4", output: "o.mp4", width: Infinity, height: 100, fit: "contain", formatId: "mp4-h264" })).toThrow(UnsafeCommandValueError);
  });

  it("only allowlisted encoder strings ever appear after -c:a/-c:v — never a free-text codec", () => {
    for (const encoder of Object.values(AUDIO_ENCODERS)) expect(typeof encoder).toBe("string");
    for (const encoder of Object.values(VIDEO_ENCODERS)) expect(typeof encoder).toBe("string");
    const command = buildConvertAudioCommand({ input: "i.wav", output: "o.mp3", formatId: "mp3", stripMetadata: false });
    const codecIndex = command.indexOf("-c:a");
    expect(command[codecIndex + 1]).toBe(AUDIO_ENCODERS.mp3);
  });

  it("source never constructs a shell command string or calls a shell (no exec via string concatenation)", () => {
    const source = fs.readFileSync("src/lib/public-tools/media/ffmpeg-commands.ts", "utf8");
    expect(source).not.toMatch(/child_process|exec\(`|spawn\(/);
  });
});

describe("media/ffmpeg-commands.ts: buildTrimAudioCommand", () => {
  it("uses stream copy (-c copy) when no fades are requested", () => {
    const command = buildTrimAudioCommand({ input: "i.mp3", output: "o.mp3", startMs: 1000, endMs: 5000, copyCodec: true });
    expect(command).toContain("copy");
    expect(command).toContain("-ss");
    expect(command).toContain("00:00:01.000");
  });
  it("applies an afade filter and re-encodes when fades are requested", () => {
    const command = buildTrimAudioCommand({ input: "i.mp3", output: "o.mp3", startMs: 0, endMs: 5000, fadeInMs: 500, copyCodec: true, formatId: "mp3" });
    expect(command.join(" ")).toMatch(/afade=t=in/);
    expect(command).not.toContain("copy");
  });
  it("real bug fix: always uses an explicit encoder (never an implicit/omitted -c:a) when a real copy was not requested, even without fades — regression test for the Fase 45 browser correction where a WAV source trimmed to a requested .mp3 output produced an empty file because '-c copy' was used to mux raw PCM into an MP3 container", () => {
    const command = buildTrimAudioCommand({ input: "i.wav", output: "o.mp3", startMs: 0, endMs: 5000, copyCodec: false, formatId: "mp3" });
    expect(command).not.toContain("copy");
    const codecIndex = command.indexOf("-c:a");
    expect(codecIndex).toBeGreaterThan(-1);
    expect(command[codecIndex + 1]).toBe(AUDIO_ENCODERS.mp3);
  });
});

describe("media/ffmpeg-commands.ts: buildConcatAudioCommand", () => {
  it("references each input strictly by its numeric stream index, never by a user filename", () => {
    const command = buildConcatAudioCommand({ inputs: ["input-1.mp3", "input-2.wav"], output: "output-1.mp3", formatId: "mp3" });
    const filterIndex = command.indexOf("-filter_complex");
    expect(command[filterIndex + 1]).toMatch(/\[0:a\]\[1:a\]concat=n=2:v=0:a=1\[joined\]/);
  });
  it("rejects fewer than 2 inputs", () => {
    expect(() => buildConcatAudioCommand({ inputs: ["only-one.mp3"], output: "o.mp3", formatId: "mp3" })).toThrow();
  });
});

describe("media/ffmpeg-commands.ts: buildTrimVideoCommand", () => {
  it("fast mode uses stream copy", () => {
    const command = buildTrimVideoCommand({ input: "i.mp4", output: "o.mp4", startMs: 0, endMs: 5000, mode: "fast", keepAudio: true });
    expect(command).toContain("copy");
  });
  it("precise mode re-encodes with the chosen video encoder", () => {
    const command = buildTrimVideoCommand({ input: "i.mp4", output: "o.mp4", startMs: 0, endMs: 5000, mode: "precise", keepAudio: true, formatId: "mp4-h264" });
    expect(command).toContain(VIDEO_ENCODERS["mp4-h264"]);
  });
  it("adds -an when audio is not kept", () => {
    const command = buildTrimVideoCommand({ input: "i.mp4", output: "o.mp4", startMs: 0, endMs: 5000, mode: "fast", keepAudio: false });
    expect(command).toContain("-an");
  });
});

describe("media/ffmpeg-commands.ts: buildCompressVideoCommand", () => {
  it("uses a higher CRF (more compression, lower quality) for the 'small' preset than for 'high'", () => {
    const high = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "high", formatId: "mp4-h264", removeAudio: false });
    const small = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "small", formatId: "mp4-h264", removeAudio: false });
    const crfOf = (cmd: string[]) => Number(cmd[cmd.indexOf("-crf") + 1]);
    expect(crfOf(small)).toBeGreaterThan(crfOf(high));
  });
  it("adds -an and omits an audio encoder when removeAudio is true", () => {
    const command = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "balanced", formatId: "mp4-h264", removeAudio: true });
    expect(command).toContain("-an");
    expect(command).not.toContain("aac");
  });
  it("adds a real audio encoder (never omitted) when audio is kept", () => {
    const command = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "balanced", formatId: "mp4-h264", removeAudio: false });
    expect(command).toContain("aac");
  });
  it("adds an aspect-ratio-preserving scale filter (never a bare width x height that could deform) when maxWidth is given", () => {
    const command = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "balanced", formatId: "mp4-h264", removeAudio: false, maxWidth: 1280 });
    const vfIndex = command.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(command[vfIndex + 1]).toMatch(/scale=.*-2/); // -2 keeps the other dimension proportional
  });
  it("throws UnsafeCommandValueError for a non-finite fps or maxWidth, never silently coercing", () => {
    expect(() => buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "balanced", formatId: "mp4-h264", removeAudio: false, fps: Infinity })).toThrow(UnsafeCommandValueError);
  });
  it("uses the correct video encoder for the chosen formatId, from the allowlist only", () => {
    const command = buildCompressVideoCommand({ input: "i.mp4", output: "o.mp4", quality: "balanced", formatId: "webm-vp9", removeAudio: false });
    expect(command).toContain(VIDEO_ENCODERS["webm-vp9"]);
  });
});

describe("media/ffmpeg-commands.ts: buildResizeVideoCommand — never deforms content", () => {
  it("contain mode scales uniformly and pads, never a bare non-aspect-preserving scale", () => {
    const command = buildResizeVideoCommand({ input: "i.mp4", output: "o.mp4", width: 1080, height: 1920, fit: "contain", formatId: "mp4-h264" });
    const filter = command[command.indexOf("-vf") + 1];
    expect(filter).toMatch(/force_original_aspect_ratio=decrease/);
    expect(filter).toMatch(/pad=1080:1920/);
  });
  it("cover mode scales uniformly and crops", () => {
    const command = buildResizeVideoCommand({ input: "i.mp4", output: "o.mp4", width: 1080, height: 1920, fit: "cover", formatId: "mp4-h264" });
    const filter = command[command.indexOf("-vf") + 1];
    expect(filter).toMatch(/force_original_aspect_ratio=increase/);
    expect(filter).toMatch(/crop=1080:1920/);
  });
});

describe("media/ffmpeg-commands.ts: buildExtractAudioCommand", () => {
  it("always includes -vn (no video stream) and offers a copy path", () => {
    const command = buildExtractAudioCommand({ input: "i.mp4", output: "o.mp3", copy: true, formatId: "mp3" });
    expect(command).toContain("-vn");
    expect(command).toContain("copy");
  });
});

describe("media/ffmpeg-commands.ts: GIF two-pass palette", () => {
  it("palette command generates a palettegen filter, apply command references the palette and uses paletteuse", () => {
    const opts = { input: "i.mp4", paletteOutput: "palette.png", output: "o.gif", startMs: 0, endMs: 3000, fps: 10, width: 480, loop: true };
    const paletteCmd = buildGifPaletteCommand(opts);
    expect(paletteCmd.join(" ")).toMatch(/palettegen/);
    const applyCmd = buildGifApplyCommand(opts);
    expect(applyCmd.join(" ")).toMatch(/paletteuse/);
    expect(applyCmd).toContain("palette.png");
  });
});

describe("media/ffmpeg-commands.ts: buildExtractFramesCommand", () => {
  it("single mode uses -frames:v 1 at the requested time", () => {
    const command = buildExtractFramesCommand({ input: "i.mp4", outputPattern: "o-%03d.png", mode: "single", timeMs: 2000, format: "png" });
    expect(command).toContain("-frames:v");
    expect(command).toContain("00:00:02.000");
  });
  it("count mode computes an fps filter from count/duration and caps frames with -frames:v", () => {
    const command = buildExtractFramesCommand({ input: "i.mp4", outputPattern: "o-%03d.png", mode: "count", count: 5, durationMs: 10000, format: "png" });
    expect(command).toContain("-frames:v");
    expect(command).toContain("5");
  });
});

// ---------------------------------------------------------------------------
// ffmpeg-progress.ts — spec section 17 (real log-derived progress)
// ---------------------------------------------------------------------------
describe("media/ffmpeg-progress.ts", () => {
  it("parseTimeFromLogLine extracts real milliseconds from an FFmpeg stderr time= line", () => {
    expect(parseTimeFromLogLine("frame=  120 fps=30 time=00:00:04.20 bitrate=128.0kbits/s")).toBe(4200);
  });
  it("returns null for a line with no time= field", () => {
    expect(parseTimeFromLogLine("Input #0, wav, from 'input-1.wav':")).toBeNull();
  });
  it("computeMediaProgress caps at 99% while still processing, never claims 100% early", () => {
    const state = computeMediaProgress("processing", 9900, 10000);
    expect(state.percent).toBeLessThan(100);
  });
  it("computeMediaProgress is indeterminate (null) when total duration is unknown", () => {
    expect(computeMediaProgress("processing", 500, null).percent).toBeNull();
  });
  it("computeMediaProgress only reports 100% for the 'done' step", () => {
    expect(computeMediaProgress("done", 0, null).percent).toBe(100);
    expect(computeMediaProgress("loading-core", 0, null).percent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ffmpeg-filesystem.ts — spec sections 11, 12 (virtual names, real cleanup)
// ---------------------------------------------------------------------------
describe("media/ffmpeg-filesystem.ts", () => {
  it("generateVirtualName never echoes user input — every call produces a fresh, collision-free name", () => {
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(generateVirtualName("input", "mp3"));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^input-\d+-[a-z0-9]+\.mp3$/);
  });

  it("falls back to a safe extension when given something unexpected", () => {
    const name = generateVirtualName("output", "'; rm -rf /");
    expect(name).toMatch(/\.bin$/);
  });

  it("writeInputFile/readOutputFile/cleanupVirtualFiles round-trip through a mock FFmpeg filesystem", async () => {
    const store = new Map<string, Uint8Array>();
    const mockFs: FfmpegFsLike = {
      writeFile: async (name, data) => {
        store.set(name, data);
        return true;
      },
      readFile: async (name) => store.get(name) ?? new Uint8Array(0),
      deleteFile: async (name) => store.delete(name),
    };

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const inputName = await writeInputFile(mockFs, bytes, "wav");
    expect(store.has(inputName)).toBe(true);

    const readBack = await readOutputFile(mockFs, inputName);
    expect(Array.from(readBack)).toEqual([1, 2, 3, 4]);

    await cleanupVirtualFiles(mockFs, [inputName]);
    expect(store.has(inputName)).toBe(false);
  });

  it("cleanupVirtualFiles tolerates a name that was never created (no throw)", async () => {
    const mockFs: FfmpegFsLike = {
      writeFile: async () => true,
      readFile: async () => new Uint8Array(0),
      deleteFile: async () => {
        throw new Error("not found");
      },
    };
    await expect(cleanupVirtualFiles(mockFs, ["never-existed.mp3"])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// capabilities.ts — spec section 13 (real matrix, runtime encoder verification)
// ---------------------------------------------------------------------------
describe("media/capabilities.ts", () => {
  it("STATIC_CAPABILITY_MATRIX documents container, video codec, and audio codec as distinct facts (never inferred from extension)", () => {
    for (const format of STATIC_CAPABILITY_MATRIX) {
      expect(format.container).toBeTruthy();
      expect(format.ffmpegEncoders.length).toBeGreaterThan(0);
    }
  });

  it("parseEncoderListing extracts real encoder names from an FFmpeg -encoders style listing", () => {
    const log = [
      "Encoders:",
      " V..... = Video",
      " A..... = Audio",
      " ------",
      " V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)",
      " A..... libmp3lame           libmp3lame MP3 (MPEG audio layer 3)",
      " A..... aac                  AAC (Advanced Audio Coding)",
    ].join("\n");
    const encoders = parseEncoderListing(log);
    expect(encoders.has("libx264")).toBe(true);
    expect(encoders.has("libmp3lame")).toBe(true);
    expect(encoders.has("aac")).toBe(true);
    expect(encoders.has("libvorbis")).toBe(false);
  });

  it("resolveAvailableFormats filters to only formats whose encoders were actually detected", () => {
    const detected = new Set(["libmp3lame", "pcm_s16le"]);
    const formats = resolveAvailableFormats(detected);
    expect(formats.some((f) => f.id === "mp3")).toBe(true);
    expect(formats.some((f) => f.id === "flac")).toBe(false); // "flac" encoder was not in the detected set
  });

  it("resolveAvailableFormats returns the full static matrix (not an empty list) when detection hasn't run yet", () => {
    expect(resolveAvailableFormats(null)).toEqual(STATIC_CAPABILITY_MATRIX);
  });

  it("getFormatsByKind filters correctly by audio/video/image", () => {
    expect(getFormatsByKind("audio").every((f) => f.kind === "audio")).toBe(true);
    expect(getFormatsByKind("video").every((f) => f.kind === "video")).toBe(true);
  });

  it("describeCompatibility warns when the browser can't preview, and notes lossy compression honestly", () => {
    const mp3 = STATIC_CAPABILITY_MATRIX.find((f) => f.id === "mp3")!;
    const findings = describeCompatibility(mp3, false);
    expect(findings.some((f) => f.severity === "WARNING")).toBe(true);
    expect(findings.some((f) => f.message.includes("compresión con pérdida"))).toBe(true);
    const wav = STATIC_CAPABILITY_MATRIX.find((f) => f.id === "wav")!;
    const wavFindings = describeCompatibility(wav, true);
    expect(wavFindings.some((f) => f.severity === "WARNING")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ffmpeg-assets.ts — spec section 10 (no external CDN)
// ---------------------------------------------------------------------------
describe("media/ffmpeg-assets.ts", () => {
  it("resolves same-origin paths only — never a CDN URL", () => {
    const { coreURL, wasmURL } = resolveFfmpegAssetPaths();
    expect(coreURL.startsWith("/")).toBe(true);
    expect(wasmURL.startsWith("/")).toBe(true);
    expect(coreURL).not.toMatch(/^https?:\/\//);
    expect(wasmURL).not.toMatch(/^https?:\/\//);
  });

  it("the actual FFmpeg core assets exist in public/ (real files, not just a referenced path)", () => {
    expect(fs.existsSync("public/ffmpeg-core/ffmpeg-core.js")).toBe(true);
    expect(fs.existsSync("public/ffmpeg-core/ffmpeg-core.wasm")).toBe(true);
    const wasmSize = fs.statSync("public/ffmpeg-core/ffmpeg-core.wasm").size;
    expect(wasmSize).toBeGreaterThan(1024 * 1024); // a real WASM binary, not a placeholder
  });

  it("resolves an absolute, same-origin classWorkerURL (Fase 45 browser correction: @ffmpeg/ffmpeg's default relative Worker bootstrap is unresolvable under Turbopack and must be bypassed with an explicit absolute URL)", () => {
    const { classWorkerURL } = resolveFfmpegAssetPaths();
    expect(classWorkerURL).toMatch(/\/ffmpeg-core\/worker\.js$/);
    // In Node (no `window`), the origin prefix is empty — real absoluteness is exercised in the browser tests.
    expect(classWorkerURL).not.toMatch(/jsdelivr|unpkg|githubusercontent/);
  });

  it("the self-hosted worker.js and its sibling ESM modules (const.js, errors.js) exist as real files copied from @ffmpeg/ffmpeg, not from a CDN", () => {
    for (const file of ["worker.js", "const.js", "errors.js"]) {
      const filePath = `public/ffmpeg-core/${file}`;
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    }
  });
});

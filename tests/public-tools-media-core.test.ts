import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseTimeToMs, formatMsToTimecode, msToFfmpegTimestamp, validateTimeRange } from "@/lib/public-tools/media/timeline";
import { MEDIA_LIMITS, ACCEPTED_AUDIO_MIMES, ACCEPTED_VIDEO_MIMES, estimateLowMemoryDevice } from "@/lib/public-tools/media/limits";
import { sniffMediaContainer, extensionMatchesContainer, CONTAINER_EXTENSIONS } from "@/lib/public-tools/media/mime";
import { validateAudioFile, validateVideoFile, validateResolution, validateDuration } from "@/lib/public-tools/media/validation";
import { sanitizeFilename, buildMediaFilename } from "@/lib/public-tools/media/filenames";

// ---------------------------------------------------------------------------
// timeline.ts — spec sections 16, 42 (real time parsing, 3 accepted formats)
// ---------------------------------------------------------------------------
describe("media/timeline.ts: parseTimeToMs", () => {
  it("parses HH:MM:SS.mmm", () => {
    expect(parseTimeToMs("01:02:03.456")).toEqual({ ok: true, milliseconds: (3600 + 120 + 3) * 1000 + 456 });
  });
  it("parses MM:SS.mmm", () => {
    expect(parseTimeToMs("02:03.500")).toEqual({ ok: true, milliseconds: 123500 });
  });
  it("parses plain decimal seconds", () => {
    expect(parseTimeToMs("12.5")).toEqual({ ok: true, milliseconds: 12500 });
    expect(parseTimeToMs("7")).toEqual({ ok: true, milliseconds: 7000 });
  });
  it("rejects an empty string and a nonsense string", () => {
    expect(parseTimeToMs("").ok).toBe(false);
    expect(parseTimeToMs("not a time").ok).toBe(false);
  });
  it("rejects out-of-range minutes/seconds in HH:MM:SS, and out-of-range seconds in MM:SS (minutes may legitimately exceed 59 in MM:SS, e.g. '75:00' = 75 minutes)", () => {
    expect(parseTimeToMs("00:75:00").ok).toBe(false); // HH:MM:SS — minutes must be 0-59
    expect(parseTimeToMs("05:75.000").ok).toBe(false); // MM:SS — seconds must be 0-59
    expect(parseTimeToMs("75:00.000")).toEqual({ ok: true, milliseconds: 75 * 60 * 1000 }); // MM:SS — 75 minutes is valid
  });
  it("round-trips through formatMsToTimecode", () => {
    const ms = 3723456;
    const text = formatMsToTimecode(ms);
    expect(parseTimeToMs(text).milliseconds).toBe(ms);
  });
  it("msToFfmpegTimestamp always includes hours (unambiguous for FFmpeg -ss/-to)", () => {
    expect(msToFfmpegTimestamp(5000)).toBe("00:00:05.000");
  });
});

describe("media/timeline.ts: validateTimeRange", () => {
  it("accepts a valid range within duration", () => {
    expect(validateTimeRange(1000, 5000, 10000).ok).toBe(true);
  });
  it("rejects start >= end", () => {
    expect(validateTimeRange(5000, 5000, 10000).ok).toBe(false);
    expect(validateTimeRange(6000, 5000, 10000).ok).toBe(false);
  });
  it("rejects negative times", () => {
    expect(validateTimeRange(-1, 100, 10000).ok).toBe(false);
  });
  it("rejects an end beyond the known duration", () => {
    expect(validateTimeRange(0, 20000, 10000).ok).toBe(false);
  });
  it("rejects a selection shorter than the minimum duration", () => {
    expect(validateTimeRange(0, 50, 10000, 100).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// limits.ts — spec section 14
// ---------------------------------------------------------------------------
describe("media/limits.ts", () => {
  it("never uses WebAssembly's raw memory ceiling as the public limit (source-level sanity: limits are well below 4GB)", () => {
    expect(MEDIA_LIMITS.audio.maxFileBytes).toBeLessThan(1024 * 1024 * 1024);
    expect(MEDIA_LIMITS.video.maxFileBytes).toBeLessThan(1024 * 1024 * 1024);
  });
  it("declares real accepted MIME lists for audio and video", () => {
    expect(ACCEPTED_AUDIO_MIMES.length).toBeGreaterThan(0);
    expect(ACCEPTED_VIDEO_MIMES.length).toBeGreaterThan(0);
  });
  it("estimateLowMemoryDevice returns null (unknown) rather than a false default when deviceMemory is unavailable", () => {
    expect(estimateLowMemoryDevice()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mime.ts — spec section 13 (real magic-byte sniffing, never extension-only)
// ---------------------------------------------------------------------------
describe("media/mime.ts: sniffMediaContainer", () => {
  it("detects a real WAV header (RIFF....WAVE)", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WAVE"), 8);
    expect(sniffMediaContainer(bytes)).toBe("wav");
  });
  it("detects a real MP3 via ID3 tag", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("ID3"), 0);
    expect(sniffMediaContainer(bytes)).toBe("mp3");
  });
  it("detects a real MP3 via frame sync bytes (no ID3 tag)", () => {
    const bytes = new Uint8Array(16);
    bytes[0] = 0xff;
    bytes[1] = 0xfb;
    expect(sniffMediaContainer(bytes)).toBe("mp3");
  });
  it("detects a real OGG header (OggS)", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("OggS"), 0);
    expect(sniffMediaContainer(bytes)).toBe("ogg");
  });
  it("detects a real FLAC header (fLaC)", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("fLaC"), 0);
    expect(sniffMediaContainer(bytes)).toBe("flac");
  });
  it("detects a real MP4/M4A/MOV via the ftyp box at offset 4", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("ftyp"), 4);
    expect(sniffMediaContainer(bytes)).toBe("mp4");
  });
  it("detects a real WebM/MKV via the EBML magic number", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMediaContainer(bytes)).toBe("webm-mkv");
  });
  it("returns unknown for random bytes and for input shorter than the minimum header", () => {
    expect(sniffMediaContainer(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe("unknown");
    expect(sniffMediaContainer(new Uint8Array([1, 2]))).toBe("unknown");
  });
  it("extensionMatchesContainer correctly matches/rejects real extensions", () => {
    expect(extensionMatchesContainer("song.mp3", "mp3")).toBe(true);
    expect(extensionMatchesContainer("song.exe", "mp3")).toBe(false);
    expect(CONTAINER_EXTENSIONS.mp4).toContain("m4a");
  });
});

// ---------------------------------------------------------------------------
// validation.ts — spec section 39 (real File objects, real header sniffing)
// ---------------------------------------------------------------------------
function makeWavFile(name: string, sizeBytes: number): File {
  const bytes = new Uint8Array(Math.max(sizeBytes, 16));
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return new File([bytes], name, { type: "audio/wav" });
}

function makeMp4File(name: string, sizeBytes: number): File {
  const bytes = new Uint8Array(Math.max(sizeBytes, 16));
  bytes.set(new TextEncoder().encode("ftyp"), 4);
  return new File([bytes], name, { type: "video/mp4" });
}

describe("media/validation.ts", () => {
  it("accepts a real WAV file within the size limit", async () => {
    const result = await validateAudioFile(makeWavFile("clip.wav", 1000));
    expect(result.ok).toBe(true);
  });

  it("rejects an empty audio file", async () => {
    const result = await validateAudioFile(new File([], "empty.wav", { type: "audio/wav" }));
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("empty-file");
  });

  it("rejects an audio file over the size limit", async () => {
    const oversized = new File([new Uint8Array(1)], "big.wav", { type: "audio/wav" });
    Object.defineProperty(oversized, "size", { value: MEDIA_LIMITS.audio.maxFileBytes + 1 });
    const result = await validateAudioFile(oversized);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("too-large");
  });

  it("rejects a file whose content doesn't sniff as audio and whose MIME isn't accepted either", async () => {
    const fakeAudio = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], "fake.wav", { type: "application/zip" });
    const result = await validateAudioFile(fakeAudio);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("invalid-type");
  });

  it("warns (but doesn't reject) when the extension doesn't match the sniffed container", async () => {
    const mismatched = makeWavFile("clip.mp3", 1000); // real WAV bytes, misleading .mp3 extension
    const result = await validateAudioFile(mismatched);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it("accepts a real MP4 video file", async () => {
    const result = await validateVideoFile(makeMp4File("clip.mp4", 1000));
    expect(result.ok).toBe(true);
  });

  it("rejects an empty video file", async () => {
    const result = await validateVideoFile(new File([], "empty.mp4", { type: "video/mp4" }));
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("empty-file");
  });

  it("validateResolution rejects a resolution beyond the configured maximum", () => {
    expect(validateResolution(7680, 4320).ok).toBe(false);
    expect(validateResolution(1920, 1080).ok).toBe(true);
  });

  it("validateDuration rejects a duration beyond the given maximum", () => {
    expect(validateDuration(3601, 3600).ok).toBe(false);
    expect(validateDuration(100, 3600).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filenames.ts — spec section 40 (extension always matches the real output)
// ---------------------------------------------------------------------------
describe("media/filenames.ts", () => {
  it("reuses the shared sanitizeFilename (source-level check: no second implementation)", () => {
    const source = fs.readFileSync("src/lib/public-tools/media/filenames.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/filenames"/);
  });
  it("buildMediaFilename produces a safe, correctly-extensioned filename", () => {
    expect(buildMediaFilename("video-recortado", "mp4")).toBe("video-recortado.mp4");
    expect(sanitizeFilename("../../etc/passwd.mp3")).not.toMatch(/\.\.|\//);
  });
});

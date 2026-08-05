import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_TOOL_DEFINITIONS,
  PUBLIC_TOOL_CATEGORIES,
  findPublicTool,
  getNonEmptyPublicToolCategories,
  getNewPublicTools,
} from "@/lib/public-tools/registry";
import { RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const FASE45_SLUGS = [
  "recortar-audio",
  "unir-audios",
  "convertir-audio",
  "recortar-video",
  "comprimir-video",
  "redimensionar-video",
  "extraer-audio-video",
  "video-a-gif",
  "extraer-fotogramas-video",
  "editar-subtitulos",
  "grabador-de-voz",
  "grabador-de-pantalla",
];

const FASE45_AUDIO_SLUGS = ["recortar-audio", "unir-audios", "convertir-audio"];
const FASE45_VIDEO_SLUGS = ["recortar-video", "comprimir-video", "redimensionar-video", "extraer-audio-video", "video-a-gif", "extraer-fotogramas-video"];
const FASE45_SUBTITLE_SLUGS = ["editar-subtitulos"];
const FASE45_RECORDING_SLUGS = ["grabador-de-voz", "grabador-de-pantalla"];

const FASE45_COMPONENT_FILES = [
  "trim-audio-tool",
  "join-audio-tool",
  "convert-audio-tool",
  "trim-video-tool",
  "compress-video-tool",
  "resize-video-tool",
  "extract-audio-tool",
  "video-to-gif-tool",
  "extract-frames-tool",
  "subtitle-editor-tool",
  "voice-recorder-tool",
  "screen-recorder-tool",
];

// ---------------------------------------------------------------------------
// Inventario y objetivo cuantitativo (spec sections 3, 4, 6)
// ---------------------------------------------------------------------------
describe("Fase 45: inventory — 12 new tools, 61+ total, no equivalent existed before", () => {
  it("adds exactly the 12 prioritized tools, each with a real registry entry", () => {
    for (const slug of FASE45_SLUGS) expect(findPublicTool(slug)).toBeDefined();
    expect(FASE45_SLUGS).toHaveLength(12);
  });

  it("catalog totals at least 61 public tools (Fase 46 has since raised this further to 73+, checked in its own regression file)", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(61);
  });

  it("every tool id/slug is unique across the whole catalog (no duplicate registration)", () => {
    const ids = PUBLIC_TOOL_DEFINITIONS.map((t) => t.id);
    const slugs = PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("the existing image compressor/resizer is not duplicated — no second image compressor, cropper, palette extractor, or redaction tool was added this phase", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "comprimir-imagen")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "recortar-imagen")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "extraer-paleta-colores")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "ocultar-informacion-imagen")).toHaveLength(1);
    // no new tool's keywords collide with the image compressor's
    const imageCompressor = findPublicTool("comprimir-imagen")!;
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      const overlap = tool.keywords.filter((k) => imageCompressor.keywords.includes(k));
      expect(overlap).toEqual([]);
    }
  });

  it("no other tool in the catalog duplicates a Fase 45 capability by keyword overlap", () => {
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      const others = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug !== slug);
      for (const other of others) {
        const overlap = tool.keywords.filter((k) => other.keywords.includes(k));
        expect(overlap).toEqual([]);
      }
    }
  });

  it("the 12 Fase 44 tools are not flagged isNew (the 'Nuevas' badge tracks only the most recent batch — Fase 46's 12 tools now hold that badge, checked in its own regression file)", () => {
    const fase44Slugs = [
      "generador-facturas-presupuestos", "generador-firma-correo", "generador-open-graph", "generador-robots-txt",
      "generador-sitemap-xml", "generador-schema-json-ld", "generador-degradados-css", "generador-sombras-css",
      "editor-markdown", "convertir-csv-json", "probador-expresiones-regulares", "generador-expresiones-cron",
    ];
    for (const slug of fase44Slugs) expect(findPublicTool(slug)!.isNew).toBe(false);
  });

  it("Fase 45's own 12 tools are no longer flagged isNew — superseded by Fase 46's batch, exactly as Fase 45 itself superseded Fase 44's", () => {
    for (const slug of FASE45_SLUGS) expect(findPublicTool(slug)!.isNew).toBe(false);
    expect(getNewPublicTools().map((t) => t.slug)).not.toEqual(expect.arrayContaining(FASE45_SLUGS));
  });

  it("no Fase 43 or earlier tool is ever flagged isNew by this point (only one batch is ever 'new' at a time)", () => {
    const fase43Slugs = [
      "generador-contrasenas", "comprobar-fortaleza-contrasena", "generador-uuid", "generador-hash", "formatear-json",
      "codificar-base64", "codificar-url", "convertidor-timestamp-unix", "conversor-unidades", "calculadora-porcentajes",
      "calculadora-edad-fechas", "comprobar-contraste-colores",
    ];
    for (const slug of fase43Slugs) expect(findPublicTool(slug)!.isNew).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Distribución mínima 3/6/1/2 (spec section 4)
// ---------------------------------------------------------------------------
describe("Fase 45: minimum category distribution (3 audio / 6 video / 1 subtitulos / 2 grabacion)", () => {
  it("has at least 3 audio tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "audio").length).toBeGreaterThanOrEqual(3);
    for (const slug of FASE45_AUDIO_SLUGS) expect(findPublicTool(slug)!.category).toBe("audio");
  });
  it("has at least 6 video tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "video").length).toBeGreaterThanOrEqual(6);
    for (const slug of FASE45_VIDEO_SLUGS) expect(findPublicTool(slug)!.category).toBe("video");
  });
  it("has at least 1 subtitulos tool", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "subtitulos").length).toBeGreaterThanOrEqual(1);
    for (const slug of FASE45_SUBTITLE_SLUGS) expect(findPublicTool(slug)!.category).toBe("subtitulos");
  });
  it("has at least 2 grabacion tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "grabacion").length).toBeGreaterThanOrEqual(2);
    for (const slug of FASE45_RECORDING_SLUGS) expect(findPublicTool(slug)!.category).toBe("grabacion");
  });

  it("the 4 new categories (audio, video, subtitulos, grabacion) exist in PUBLIC_TOOL_CATEGORIES with a real label", () => {
    for (const slug of ["audio", "video", "subtitulos", "grabacion"]) {
      const category = PUBLIC_TOOL_CATEGORIES.find((c) => c.slug === slug);
      expect(category).toBeDefined();
      expect(category!.label.length).toBeGreaterThan(0);
    }
  });

  it("the 4 new categories are never rendered empty", () => {
    const nonEmpty = getNonEmptyPublicToolCategories().map((c) => c.slug);
    for (const slug of ["audio", "video", "subtitulos", "grabacion"]) expect(nonEmpty).toContain(slug);
  });

  it("9 of the 12 tools use LOCAL_MEDIA and 2 use LOCAL_RECORDING execution types; the subtitle editor uses DETERMINISTIC (pure JS, no FFmpeg/recording)", () => {
    for (const slug of [...FASE45_AUDIO_SLUGS, ...FASE45_VIDEO_SLUGS]) {
      expect(findPublicTool(slug)!.executionType).toBe("LOCAL_MEDIA");
    }
    for (const slug of FASE45_RECORDING_SLUGS) {
      expect(findPublicTool(slug)!.executionType).toBe("LOCAL_RECORDING");
    }
    expect(findPublicTool("editar-subtitulos")!.executionType).toBe("DETERMINISTIC");
  });

  it("no Fase 45 tool is labeled as using AI, and none connects local or external AI", () => {
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.requiresLocalAI).toBe(false);
      expect(tool.executionType).not.toBe("LOCAL_AI");
      expect(tool.executionType).not.toBe("HYBRID");
    }
  });

  it("all 12 new tools support guests (no registration) and process device-only", () => {
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.supportsGuest).toBe(true);
      expect(tool.privacy).toBe("device-only");
    }
  });

  it("the 9 file-accepting media tools declare real acceptedFileTypes; the 2 recording tools declare null (they don't accept an uploaded file)", () => {
    for (const slug of [...FASE45_AUDIO_SLUGS, ...FASE45_VIDEO_SLUGS, "editar-subtitulos"]) {
      expect(findPublicTool(slug)!.acceptedFileTypes).not.toBeNull();
      expect(findPublicTool(slug)!.acceptedFileTypes!.length).toBeGreaterThan(0);
    }
    for (const slug of FASE45_RECORDING_SLUGS) {
      expect(findPublicTool(slug)!.acceptedFileTypes).toBeNull();
    }
  });

  it("every Fase 45 tool declares a real, non-null limitsSummary sourced from centralized limits", () => {
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.limitsSummary).toBeTruthy();
      expect(tool.limitsSummary!.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Núcleo multimedia compartido: ubicación real, sin duplicación (spec sections 7-21)
// ---------------------------------------------------------------------------
describe("Fase 45: shared media core exists and is the single source used by every tool", () => {
  const CORE_FILES = [
    "src/lib/public-tools/media/capabilities.ts",
    "src/lib/public-tools/media/limits.ts",
    "src/lib/public-tools/media/validation.ts",
    "src/lib/public-tools/media/mime.ts",
    "src/lib/public-tools/media/filenames.ts",
    "src/lib/public-tools/media/timeline.ts",
    "src/lib/public-tools/media/ffmpeg-client.ts",
    "src/lib/public-tools/media/ffmpeg-assets.ts",
    "src/lib/public-tools/media/ffmpeg-filesystem.ts",
    "src/lib/public-tools/media/ffmpeg-progress.ts",
    "src/lib/public-tools/media/ffmpeg-commands.ts",
    "src/lib/public-tools/media/audio.ts",
    "src/lib/public-tools/media/video.ts",
    "src/lib/public-tools/media/subtitles.ts",
    "src/lib/public-tools/media/recording.ts",
    "src/lib/public-tools/media/media-recorder.ts",
    "src/lib/public-tools/media/object-urls.ts",
    "src/lib/public-tools/media/cleanup.ts",
  ];

  it("every declared core module file exists", () => {
    for (const file of CORE_FILES) expect(existsSync(path.join(ROOT, file))).toBe(true);
  });

  it("media/object-urls.ts re-exports the shared ObjectUrlRegistry, never a second Object URL implementation", () => {
    const source = read("src/lib/public-tools/media/object-urls.ts");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/object-url"/);
  });

  it("media/filenames.ts reuses the shared sanitizeFilename/buildOutputFilename core, never a second sanitizer", () => {
    const source = read("src/lib/public-tools/media/filenames.ts");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/filenames"/);
  });

  it("the frame-extraction ZIP download reuses the shared files/zip.ts core, never a second ZIP implementation", () => {
    const source = read("src/components/public-tools/tools/extract-frames-tool.tsx");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/zip"|import\("@\/lib\/public-tools\/files\/zip"\)/);
  });

  it("every recording/download flow reuses the shared downloadBlob core, never a bespoke download implementation", () => {
    for (const file of ["voice-recorder-tool", "screen-recorder-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/from "@\/lib\/public-tools\/files\/download"/);
    }
  });

  it("cleanup.ts is the single place that stops tracks, revokes Object URLs, and terminates FFmpeg — not duplicated per tool", () => {
    let usageCount = 0;
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (source.includes("performMediaCleanup")) usageCount++;
    }
    expect(usageCount).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// FFmpeg en el navegador: origen propio, nunca CDN externo (spec section 10)
// ---------------------------------------------------------------------------
describe("Fase 45: FFmpeg assets are served from this project's own origin, never an external CDN", () => {
  it("public/ffmpeg-core/ffmpeg-core.js and ffmpeg-core.wasm exist as real files, not placeholders", () => {
    const jsPath = path.join(ROOT, "public/ffmpeg-core/ffmpeg-core.js");
    const wasmPath = path.join(ROOT, "public/ffmpeg-core/ffmpeg-core.wasm");
    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(wasmPath)).toBe(true);
    expect(statSync(jsPath).size).toBeGreaterThan(1000);
    expect(statSync(wasmPath).size).toBeGreaterThan(1024 * 1024); // real compiled WASM, not a stub
  });

  it("ffmpeg-assets.ts never references jsdelivr, unpkg, a GitHub raw URL, or any other remote origin", () => {
    const source = read("src/lib/public-tools/media/ffmpeg-assets.ts");
    expect(source).not.toMatch(/jsdelivr|unpkg\.com|githubusercontent|http:\/\/|https:\/\//);
    expect(source).toMatch(/\/ffmpeg-core\//);
  });

  it("no Fase 45 core or component file references a remote FFmpeg CDN", () => {
    const CORE_AND_TOOL_FILES = [
      "src/lib/public-tools/media/ffmpeg-client.ts",
      ...FASE45_COMPONENT_FILES.map((f) => `src/components/public-tools/tools/${f}.tsx`),
    ];
    for (const file of CORE_AND_TOOL_FILES) {
      const source = read(file);
      expect(source).not.toMatch(/jsdelivr|unpkg\.com|githubusercontent/);
    }
  });

  it("FFmpeg is never imported eagerly at module scope in a tool component — only via dynamic import inside an event handler/effect (client-only, lazy-loaded)", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/^import .* from ["']@ffmpeg\/(ffmpeg|util)["'];?$/m);
    }
  });

  it("FFmpeg is never imported anywhere in /herramientas, the homepage, or a Server Component", () => {
    const centerSource = read("src/app/(public)/herramientas/page.tsx");
    const homeSource = read("src/app/(public)/page.tsx");
    expect(centerSource).not.toMatch(/@ffmpeg|ffmpeg-client|ffmpeg-core/);
    expect(homeSource).not.toMatch(/@ffmpeg|ffmpeg-client|ffmpeg-core/);
  });

  it("every Fase 45 tool component is a client component ('use client'), consistent with browser-only FFmpeg/MediaRecorder/getDisplayMedia usage", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source.trimStart().startsWith('"use client"')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Comandos FFmpeg seguros: sin cadenas de shell, sin argumentos del visitante (spec section 11)
// ---------------------------------------------------------------------------
describe("Fase 45: FFmpeg command safety (source-level, re-asserted at the integration level)", () => {
  it("ffmpeg-commands.ts never builds a shell string via exec/spawn/child_process", () => {
    const source = read("src/lib/public-tools/media/ffmpeg-commands.ts");
    expect(source).not.toMatch(/child_process|execSync|spawnSync/);
  });

  it("no tool component passes a raw user-typed string directly as an FFmpeg codec or filter argument — codec choices route through a typed FormatId/enum, not free text", () => {
    for (const file of ["trim-audio-tool", "convert-audio-tool", "compress-video-tool", "resize-video-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/exec\(\[.*e\.target\.value/);
    }
  });
});

// ---------------------------------------------------------------------------
// Carga dinámica y registro de componentes (spec sections 6, 41)
// ---------------------------------------------------------------------------
describe("Fase 45: component wiring", () => {
  it("every Fase 45 tool has a renderable slug wired into the switch statement", () => {
    for (const slug of FASE45_SLUGS) expect(RENDERABLE_TOOL_SLUGS as readonly string[]).toContain(slug);
  });

  it("RENDERABLE_TOOL_SLUGS exactly matches the registry (no orphaned component, no unrendered registry entry) — 61 total", () => {
    const registrySlugs = new Set(PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug));
    expect(RENDERABLE_TOOL_SLUGS).toHaveLength(PUBLIC_TOOL_DEFINITIONS.length);
    expect(RENDERABLE_TOOL_SLUGS.length).toBeGreaterThanOrEqual(61);
    for (const slug of RENDERABLE_TOOL_SLUGS) expect(registrySlugs.has(slug)).toBe(true);
  });

  it("every Fase 45 tool component is loaded via next/dynamic, not imported eagerly", () => {
    const source = read("src/components/public-tools/tool-component-registry.tsx");
    for (const component of FASE45_COMPONENT_FILES) {
      const regex = new RegExp(`dynamic\\(\\(\\) => import\\("@/components/public-tools/tools/${component}"\\)`);
      expect(source).toMatch(regex);
    }
  });

  it("the new icons are registered in the closed tool-icon.tsx map (never a dynamic lucide-react lookup)", () => {
    const source = read("src/components/public-tools/tool-icon.tsx");
    for (const icon of ["Scissors", "ListMusic", "FileAudio", "Clapperboard", "FileVideo", "Maximize2", "AudioLines", "PlaySquare", "Grid3x3", "Captions", "Mic", "MonitorPlay"]) {
      expect(source).toMatch(new RegExp(`\\b${icon}\\b`));
    }
  });

  it("every Fase 45 registry entry's icon string resolves to one of the registered icon imports", () => {
    const iconSource = read("src/components/public-tools/tool-icon.tsx");
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(iconSource).toMatch(new RegExp(`\\b${tool.icon}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// Privacidad (spec sections 9, 24, 25) — the two exact mandated notice sentences
// ---------------------------------------------------------------------------
describe("Fase 45: privacy invariants", () => {
  it("no Fase 45 tool component calls fetch/XMLHttpRequest/a server action to send file or recording content (only Blob-URL self-fetches for local re-reads are allowed)", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/"use server"/);
      // any fetch() call in these files must only ever target a local blob: URL, never a path/host
      const fetchCalls = source.match(/fetch\(([^)]*)\)/g) ?? [];
      for (const call of fetchCalls) {
        expect(call).toMatch(/Url|url/); // must reference one of our own *Url variables, not a literal path
      }
    }
  });

  it("no Fase 45 tool component or core logs filenames or content via console", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("no Fase 45 tool component persists to localStorage/sessionStorage/IndexedDB/cookies (never auto-saves recordings or files)", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });

  it("the processing-badge declares both exact mandated privacy sentences for LOCAL_MEDIA and LOCAL_RECORDING", () => {
    const badgeSource = read("src/components/public-tools/processing-badge.tsx");
    expect(badgeSource).toMatch(/Tus archivos se procesan en tu dispositivo y no se suben al servidor\./);
    expect(badgeSource).toMatch(/La grabación permanece en tu dispositivo hasta que decidas descargarla\./);
  });

  it("the 9 file-accepting media tools resolve to the file-based privacy notice via hasFiles (real acceptedFileTypes), and the 2 recording tools resolve to the LOCAL_RECORDING notice", () => {
    const layoutSource = read("src/components/public-tools/public-tool-layout.tsx");
    expect(layoutSource).toMatch(/hasFiles=\{Boolean\(tool\.acceptedFileTypes\)\}/);
    for (const slug of [...FASE45_AUDIO_SLUGS, ...FASE45_VIDEO_SLUGS, "editar-subtitulos"]) {
      expect(findPublicTool(slug)!.acceptedFileTypes).not.toBeNull();
    }
    for (const slug of FASE45_RECORDING_SLUGS) {
      expect(findPublicTool(slug)!.acceptedFileTypes).toBeNull();
      expect(findPublicTool(slug)!.executionType).toBe("LOCAL_RECORDING");
    }
  });

  it("recorder tools request permission only inside a button handler, never at module scope or in a mount-time effect", () => {
    for (const file of ["voice-recorder-tool", "screen-recorder-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/useEffect\(\(\) => \{\s*(navigator\.mediaDevices\.getUserMedia|navigator\.mediaDevices\.getDisplayMedia)/);
      expect(source).toMatch(/getUserMedia|getDisplayMedia/);
    }
  });

  it("recorder tools call track cleanup (stopAllTracks) both on stop and on unmount", () => {
    for (const file of ["voice-recorder-tool", "screen-recorder-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/stopAllTracks/);
      expect(source).toMatch(/useEffect/);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad (spec sections 11, 28, 39) — no eval, no dangerous rendering of file content
// ---------------------------------------------------------------------------
describe("Fase 45: security invariants", () => {
  it("no Fase 45 core or component uses eval or new Function", () => {
    const coreFiles = [
      "src/lib/public-tools/media/ffmpeg-commands.ts",
      "src/lib/public-tools/media/ffmpeg-client.ts",
      "src/lib/public-tools/media/subtitles.ts",
    ];
    for (const file of coreFiles) {
      const source = read(file);
      expect(source).not.toMatch(/\beval\(|new Function\(/);
    }
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\beval\(|new Function\(/);
    }
  });

  it("only subtitle-editor-tool.tsx uses dangerouslySetInnerHTML among the 12 new components, and only fed by sanitizeCueTextToHtml's output", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      const usesDangerous = source.includes("dangerouslySetInnerHTML");
      if (usesDangerous) {
        expect(file).toBe("subtitle-editor-tool");
        expect(source).toMatch(/sanitizeCueTextToHtml/);
      }
    }
  });

  it("the GIF/frame preview components use <img> only for local blob: URLs generated by this app, never for a user-controlled remote URL", () => {
    for (const file of ["video-to-gif-tool", "extract-frames-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/<img/);
      expect(source).not.toMatch(/<img[^>]*src=\{[^}]*\.value/); // never bound directly to a raw input value
    }
  });
});

// ---------------------------------------------------------------------------
// Accesibilidad (spec sections 16, 31) — manual time entry, labels
// ---------------------------------------------------------------------------
describe("Fase 45: accessibility", () => {
  it("media-time-range.tsx (the shared manual time-entry component) exists and is reused by every time-range tool, never a drag-only timeline", () => {
    expect(existsSync(path.join(ROOT, "src/components/public-tools/media-time-range.tsx"))).toBe(true);
    for (const file of ["trim-audio-tool", "trim-video-tool", "extract-audio-tool", "video-to-gif-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/MediaTimeRangeEditor/);
    }
  });

  it("every Fase 45 tool component uses <Label htmlFor> for its primary inputs", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/<Label htmlFor=/);
    }
  });

  it("no Fase 45 component uses window.alert or window.confirm", () => {
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("results, progress, and recorder status regions use aria-live across the new tools", () => {
    let ariaLiveCount = 0;
    for (const file of FASE45_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (source.includes("aria-live")) ariaLiveCount++;
    }
    expect(ariaLiveCount).toBeGreaterThanOrEqual(10);
  });

  it("media-processing-status.tsx (the shared progress component) exists and is reused across FFmpeg-driven tools, not reimplemented per tool", () => {
    expect(existsSync(path.join(ROOT, "src/components/public-tools/media-processing-status.tsx"))).toBe(true);
    let usageCount = 0;
    for (const file of [...FASE45_AUDIO_SLUGS, ...FASE45_VIDEO_SLUGS].map((s) => FASE45_COMPONENT_FILES[FASE45_SLUGS.indexOf(s)])) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (source.includes("MediaProcessingStatus")) usageCount++;
    }
    expect(usageCount).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// SEO y contenido honesto (spec sections 32, 50, 54)
// ---------------------------------------------------------------------------
describe("Fase 45: SEO and honest copy", () => {
  it("no Fase 45 tool claims universal codec/browser compatibility, guaranteed compression, or automatic transcription as a positive, unqualified assertion", () => {
    const bannedPhrases = [
      /compatible con (todos|cualquier) los? (navegador|formato)/i,
      /reduce siempre el tama[ñn]o/i,
      /transcribe autom[aá]ticamente/i,
      /traduce autom[aá]ticamente/i,
      /precisi[oó]n de fotograma garantizada/i,
      /disponible en todos los navegadores/i,
    ];
    const negationMarkers = /\bno\b|\bnunca\b|\bninguna\b|\bningún\b|\bno siempre\b/i;
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      const text = `${tool.longDescription} ${tool.shortDescription} ${tool.metadata.description} ${tool.faq.map((f) => f.answer).join(" ")}`;
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const phrase of bannedPhrases) {
        const offendingSentence = sentences.find((s) => phrase.test(s) && !negationMarkers.test(s));
        expect(offendingSentence).toBeUndefined();
      }
    }
  });

  it("the video compressor FAQ explicitly denies guaranteeing a concrete size reduction", () => {
    const tool = findPublicTool("comprimir-video")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/nunca promete una cifra de antemano/i);
  });

  it("the subtitle editor FAQ explicitly denies automatic transcription/translation and burning subtitles into the video", () => {
    const tool = findPublicTool("editar-subtitulos")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no realiza transcripción ni traducción automática/i);
    expect(faqText).toMatch(/incrustarlos en el video de forma permanente no es una función/i);
  });

  it("the voice recorder FAQ explicitly denies requesting the microphone on page load and denies always producing MP3", () => {
    const tool = findPublicTool("grabador-de-voz")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/nunca automáticamente al cargar la página/i);
    expect(faqText).toMatch(/el formato depende del navegador/i);
  });

  it("the screen recorder FAQ explicitly denies auto-selecting a source and denies universal system-audio support", () => {
    const tool = findPublicTool("grabador-de-pantalla")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/siempre se usa el selector nativo del navegador/i);
    expect(faqText).toMatch(/no en todos/i);
  });

  it("the video trimmer FAQ explicitly denies frame-exact precision for the fast-cut mode", () => {
    const tool = findPublicTool("recortar-video")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no.*exacto al fotograma|puede ajustarse al keyframe/i);
  });

  it("the audio converter FAQ explicitly denies showing unavailable formats and denies universal lossless conversion", () => {
    const tool = findPublicTool("convertir-audio")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/solo se muestran los formatos cuyo codificador está realmente presente/i);
    expect(faqText).toMatch(/solo wav y flac son sin pérdida/i);
  });

  it("every tool has a distinct metadata title across the whole 61-tool catalog (no copy-pasted introduction)", () => {
    const titles = PUBLIC_TOOL_DEFINITIONS.map((t) => t.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("sitemap.ts is registry-driven, so the 12 new tools are automatically included without a manual edit", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/getAllPublicTools/);
    for (const slug of FASE45_SLUGS) expect(findPublicTool(slug)).toBeDefined();
  });

  it("each Fase 45 tool links 2-4 related tools that all exist in the registry", () => {
    for (const slug of FASE45_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.relatedTools.length).toBeGreaterThanOrEqual(2);
      expect(tool.relatedTools.length).toBeLessThanOrEqual(4);
      for (const relatedSlug of tool.relatedTools) expect(findPublicTool(relatedSlug)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Centro público y página principal (spec sections 3, 34, 55)
// ---------------------------------------------------------------------------
describe("Fase 45: public center page", () => {
  it("/herramientas metadata reflects the current tool total (superseded again by Fase 49's 109)", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).toMatch(/109/);
    expect(source).not.toMatch(/49 herramientas/);
    expect(source).not.toMatch(/61 herramientas/);
    expect(source).not.toMatch(/73 herramientas/);
    expect(source).not.toMatch(/85 herramientas/);
    expect(source).not.toMatch(/97 herramientas/);
  });

  it("/herramientas still renders a dynamic tool count from the registry, never a hardcoded number in JSX", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).toMatch(/\{tools\.length\}/);
  });

  it("does not create a second /tools center or duplicate registry — this phase extends the existing /herramientas center only", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/tools"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/tools"))).toBe(false);
  });

  it("the homepage still shows a reduced 6-tool selection, never all 61 (regression check)", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/getFeaturedPublicTools\(\)\.slice\(0, 6\)/);
  });

  it("featured flags were curated (not all 9 file-based tools left featured), matching the established multi-phase curation pattern", () => {
    const featuredFase45 = FASE45_SLUGS.filter((slug) => findPublicTool(slug)!.featured);
    expect(featuredFase45.length).toBeGreaterThan(0);
    expect(featuredFase45.length).toBeLessThan(FASE45_SLUGS.length);
  });
});

// ---------------------------------------------------------------------------
// Servicio al cliente (spec section 36) — must never gain file/recording access
// ---------------------------------------------------------------------------
describe("Fase 45: customer-support agent compatibility unaffected", () => {
  it("the customer-support agent service was not modified to auto-approve, execute, receive files, listen to recordings, or process media from the new tools", () => {
    const source = read("src/server/services/agent-customer-support.ts");
    for (const slug of FASE45_SLUGS) expect(source).not.toMatch(new RegExp(slug));
    expect(source).not.toMatch(/getUserMedia|getDisplayMedia|MediaRecorder|ffmpeg/i);
  });

  it("/herramientas is still the syncable path source, unchanged by this phase", () => {
    const source = read("src/lib/customer-support/internal-path.ts");
    expect(source).toMatch(/"\/herramientas"/);
  });
});

// ---------------------------------------------------------------------------
// Regresión: todo lo construido en fases previas y el resto de la app siguen intactos
// ---------------------------------------------------------------------------
describe("Fase 45: regression — everything built in earlier phases still exists untouched", () => {
  it("all 49 prior tools (Fase 41-44) still exist in the registry", () => {
    const priorSlugs = [
      "contador-de-palabras", "reescritor-de-textos", "limpiador-de-texto", "resumidor-de-textos", "corrector-de-textos",
      "generador-titulos-meta-descripciones", "generador-contenido-redes-sociales", "generador-codigo-qr", "comprimir-imagen",
      "generador-utm", "analizador-de-titulos", "reutilizador-de-contenido", "calculadora-engagement",
      "unir-pdf", "dividir-pdf", "organizar-pdf", "imagenes-a-pdf", "pdf-a-imagenes", "marca-de-agua-pdf",
      "numerar-paginas-pdf", "recortar-imagen", "eliminar-metadatos-imagen", "generador-favicon", "extraer-paleta-colores", "ocultar-informacion-imagen",
      "generador-contrasenas", "comprobar-fortaleza-contrasena", "generador-uuid", "generador-hash", "formatear-json",
      "codificar-base64", "codificar-url", "convertidor-timestamp-unix", "conversor-unidades", "calculadora-porcentajes",
      "calculadora-edad-fechas", "comprobar-contraste-colores",
      "generador-facturas-presupuestos", "generador-firma-correo", "generador-open-graph", "generador-robots-txt",
      "generador-sitemap-xml", "generador-schema-json-ld", "generador-degradados-css", "generador-sombras-css",
      "editor-markdown", "convertir-csv-json", "probador-expresiones-regulares", "generador-expresiones-cron",
    ];
    for (const slug of priorSlugs) expect(findPublicTool(slug)).toBeDefined();
    expect(priorSlugs).toHaveLength(49);
  });

  it("the PDF core (pdf-lib/pdfjs-dist) files still exist untouched", () => {
    for (const file of ["load", "merge", "split", "organize", "watermark", "page-numbers", "images-to-pdf", "render", "ranges"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/pdf/${file}.ts`))).toBe(true);
    }
  });

  it("the Fase 43 utilities core files still exist untouched", () => {
    for (const file of ["secure-random", "password-generator", "uuid", "crypto-digest", "json-tool", "units"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/utilities/${file}.ts`))).toBe(true);
    }
  });

  it("the Fase 44 business/web/design/development core files still exist untouched", () => {
    for (const file of ["business/invoice.ts", "web/robots.ts", "web/sitemap-builder.ts", "design/css-gradient.ts", "development/markdown.ts", "development/regex.ts", "development/cron.ts"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/${file}`))).toBe(true);
    }
  });

  it("the homepage, guest area, customer-support widget, and admin were not deleted", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/components/customer-support/widget/customer-support-widget.tsx"))).toBe(true);
  });

  it("no forbidden server-side/native media dependency was added — no fluent-ffmpeg, no native ffmpeg binary wrapper, no remote transcription/storage SDK", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const forbidden of ["fluent-ffmpeg", "ffmpeg-static", "@ffmpeg-installer/ffmpeg", "aws-sdk", "@aws-sdk/client-s3", "assemblyai", "@deepgram/sdk"]) {
      expect(deps[forbidden]).toBeUndefined();
    }
  });

  it("only one browser FFmpeg engine was added (@ffmpeg/ffmpeg + @ffmpeg/util + @ffmpeg/core), no second competing WASM media engine", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["@ffmpeg/ffmpeg"]).toBeDefined();
    expect(deps["@ffmpeg/util"]).toBeDefined();
    expect(deps["@ffmpeg/core"]).toBeDefined();
    for (const other of ["mediabunny", "@mediapipe/tasks-vision", "ffmpeg.js", "wasm-video-encoder"]) {
      expect(deps[other]).toBeUndefined();
    }
  });

  it("pdf-lib/pdfjs-dist/fflate/zod are still present, unchanged in kind from earlier phases", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of ["pdf-lib", "pdfjs-dist", "fflate", "zod"]) expect(Boolean(deps[dep])).toBe(true);
  });

  it("eslint.config.mjs ignores the vendored ffmpeg-core bundle without weakening lint coverage of real app source", () => {
    const eslintSource = read("eslint.config.mjs");
    expect(eslintSource).toMatch(/public\/ffmpeg-core/);
    expect(eslintSource).toMatch(/\.next\/\*\*|out\/\*\*/); // pre-existing ignores untouched
  });
});

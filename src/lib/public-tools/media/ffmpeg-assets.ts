/**
 * Resolves the FFmpeg core (JS loader + WASM binary + Worker script) from
 * THIS app's own `/public/ffmpeg-core/` directory — never a CDN (spec
 * section 10: "no descargues el núcleo desde jsDelivr; unpkg; CDN externo;
 * GitHub; URL remota"). `ffmpeg-core.{js,wasm}` are a direct, unmodified
 * copy of `@ffmpeg/core`'s `dist/esm/ffmpeg-core.{js,wasm}` (single-thread
 * build — see ffmpeg-client.ts for why multi-thread is not used).
 *
 * `worker.js` (+ its sibling `const.js`/`errors.js`) is a direct copy of
 * `@ffmpeg/ffmpeg`'s own `dist/esm/worker.js`. It must be self-hosted and
 * passed explicitly as `classWorkerURL`: `@ffmpeg/ffmpeg`'s default worker
 * bootstrap is `new Worker(new URL("./worker.js", import.meta.url))`, a
 * bundler-relative pattern Turbopack cannot statically resolve inside this
 * package, which throws `"Cannot find module as expression is too dynamic"`
 * at runtime the moment `ffmpeg.load()` is called (confirmed via real
 * Chromium testing against the production build). Passing an absolute,
 * same-origin `classWorkerURL` bypasses that unresolvable code path
 * entirely — `@ffmpeg/ffmpeg` only falls back to the relative pattern when
 * `classWorkerURL` is omitted.
 */
const CORE_BASE_PATH = "/ffmpeg-core";

export interface FfmpegAssetUrls {
  coreURL: string;
  wasmURL: string;
  classWorkerURL: string;
}

/** Returns same-origin URLs for the core files. Actually converting the core/wasm to blob: URLs (via `@ffmpeg/util`'s `toBlobURL`) happens in ffmpeg-client.ts at load time, once, inside the browser — this function only ever computes same-origin path/URL strings, never fetches anything itself. */
export function resolveFfmpegAssetPaths(): FfmpegAssetUrls {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    coreURL: `${CORE_BASE_PATH}/ffmpeg-core.js`,
    wasmURL: `${CORE_BASE_PATH}/ffmpeg-core.wasm`,
    // Must be absolute: @ffmpeg/ffmpeg does `new Worker(new URL(classWorkerURL, import.meta.url))` —
    // an absolute URL here makes the (bundler-relative, unpredictable) second argument irrelevant.
    classWorkerURL: `${origin}${CORE_BASE_PATH}/worker.js`,
  };
}

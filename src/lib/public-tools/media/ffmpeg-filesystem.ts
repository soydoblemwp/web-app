/**
 * All virtual-filesystem access to a loaded FFmpeg instance goes through
 * here — every input/output name is a generated, allowlisted virtual
 * name (`input-0.bin`, `output-0.mp4`, ...), never the visitor's original
 * filename (spec section 12: "no interpoles directamente nombre
 * original... utiliza nombres virtuales generados").
 */

// A minimal structural type for the subset of the FFmpeg instance this module touches —
// avoids importing @ffmpeg/ffmpeg's types into files that don't otherwise need the package.
export interface FfmpegFsLike {
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array | string>;
  deleteFile(name: string): Promise<boolean>;
  listDir?(path: string): Promise<{ name: string; isDir: boolean }[]>;
}

let virtualNameCounter = 0;

/** Generates a fresh, collision-free virtual filename with a safe, allowlisted extension — never derived from user input. */
export function generateVirtualName(role: "input" | "output", extension: string): string {
  virtualNameCounter += 1;
  const safeExt = /^[a-z0-9]{1,5}$/i.test(extension) ? extension : "bin";
  return `${role}-${virtualNameCounter}-${Date.now().toString(36)}.${safeExt}`;
}

export async function writeInputFile(ffmpeg: FfmpegFsLike, bytes: Uint8Array, extension: string): Promise<string> {
  const name = generateVirtualName("input", extension);
  await ffmpeg.writeFile(name, bytes);
  return name;
}

export async function readOutputFile(ffmpeg: FfmpegFsLike, name: string): Promise<Uint8Array> {
  const data = await ffmpeg.readFile(name);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return data;
}

/** Deletes every named virtual file, tolerating files that were never created or already removed — always called in a `finally` block by the callers in audio.ts/video.ts so a failed job never leaves stale data in the virtual FS (spec section 11: "no dejes... resultados antiguos en el filesystem virtual"). */
export async function cleanupVirtualFiles(ffmpeg: FfmpegFsLike, names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      // Already absent — nothing to clean up.
    }
  }
}

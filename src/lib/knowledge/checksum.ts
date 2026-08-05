import { createHash } from "node:crypto";

/** Deterministic content checksum — used to detect exact duplicates and decide when a new KnowledgeSourceVersion is actually needed (spec sections 12/21/32). */
export function computeChecksum(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Same idea for raw binary buffers (used for FILE-origin sources before extraction even runs, so an identical re-upload is detected without re-extracting). */
export function computeBufferChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

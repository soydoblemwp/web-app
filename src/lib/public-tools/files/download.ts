/** Triggers a browser download for a Blob/Uint8Array without ever touching a server — a local `<a download>` click, same pattern already used by every Fase 41 tool. */
export function downloadBlob(filename: string, data: Blob | Uint8Array | ArrayBuffer, mimeType?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], mimeType ? { type: mimeType } : undefined);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

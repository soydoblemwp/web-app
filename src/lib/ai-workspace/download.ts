/** Pure formatters for the workspace's "Descargar como TXT/Markdown" actions — no DOM/Blob APIs here, so they stay unit-testable. */
export interface DownloadableResult {
  title: string;
  body: string;
  toolLabel?: string | null;
}

export function toPlainTextDocument(result: DownloadableResult): string {
  return `${result.title}\n\n${result.body}\n`;
}

export function toMarkdownDocument(result: DownloadableResult): string {
  const lines = [`# ${result.title}`, ""];
  if (result.toolLabel) lines.push(`_Generado con: ${result.toolLabel}_`, "");
  lines.push(result.body, "");
  return lines.join("\n");
}

export function buildDownloadFilename(title: string, extension: "txt" | "md"): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "resultado"}.${extension}`;
}

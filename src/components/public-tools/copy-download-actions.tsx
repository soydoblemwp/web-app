"use client";

import { useState } from "react";
import { Copy, Check, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadTextFile } from "@/lib/public-tools/csv-export";

/** Accessible copy confirmation without relying on a toast alone — the button label itself changes, satisfying "confirma la copia mediante estado accesible" (spec section 27). */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!text} aria-live="polite">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

export function DownloadButton({
  content,
  filename,
  mimeType,
  label = "Descargar",
}: {
  content: string;
  filename: string;
  mimeType?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!content}
      onClick={() => downloadTextFile(filename, content, mimeType)}
    >
      <Download className="size-3.5" /> {label}
    </Button>
  );
}

export function ResetButton({ onReset, label = "Reiniciar" }: { onReset: () => void; label?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onReset}>
      <RotateCcw className="size-3.5" /> {label}
    </Button>
  );
}

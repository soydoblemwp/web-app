"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Copy, Download, Share2, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findAiTool } from "@/lib/ai-center/registry";
import { toggleFavoriteContentAction } from "@/server/actions/content";
import { toPlainTextDocument, toMarkdownDocument, buildDownloadFilename } from "@/lib/ai-workspace/download";

/**
 * The minimal shape every consumer of this action bar can provide — a full
 * WorkspaceResult (Workspace history) already satisfies this structurally,
 * and so does a freshly-generated-but-not-yet-saved AiGenerationForm result
 * (with `id: null` until the save action returns a real ContentItem id).
 */
export interface WorkspaceActionTarget {
  id: string | null;
  title: string;
  body: string;
  sourceTool: string | null;
  toolLabel: string | null;
  isFavorite?: boolean;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The one-click actions every result gets regardless of which tool produced
 * it: copy, regenerate (reopen the source tool), download as TXT/Markdown,
 * and a share placeholder (structure only — not connected yet, per spec).
 * `showFavorite`/`showOpenInWorkspace` default to off so the Workspace's
 * existing usage (which already shows its own favorite star and is already
 * the Workspace) renders exactly as before — AiGenerationForm opts into both
 * once a result has a real, server-issued id.
 */
export function WorkspaceResultActions({
  result,
  projectId,
  showFavorite = false,
  showOpenInWorkspace = false,
  showRegenerate = true,
}: {
  result: WorkspaceActionTarget;
  projectId: string;
  showFavorite?: boolean;
  showOpenInWorkspace?: boolean;
  showRegenerate?: boolean;
}) {
  const tool = result.sourceTool ? findAiTool(result.sourceTool) : undefined;

  function handleCopy() {
    void navigator.clipboard.writeText(result.body);
    toast.success("Resultado copiado al portapapeles.");
  }

  function handleDownload(format: "txt" | "md") {
    const content =
      format === "txt"
        ? toPlainTextDocument(result)
        : toMarkdownDocument({ title: result.title, body: result.body, toolLabel: result.toolLabel });
    downloadTextFile(buildDownloadFilename(result.title, format), content);
  }

  function handleShare() {
    toast("La función de compartir estará disponible próximamente.");
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
        <Copy className="size-3.5" /> Copiar
      </Button>
      {showRegenerate && tool?.href ? (
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link href={tool.href(projectId)}>
              <RefreshCw className="size-3.5" /> Regenerar
            </Link>
          }
        />
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload("txt")}>
        <Download className="size-3.5" /> TXT
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload("md")}>
        <Download className="size-3.5" /> Markdown
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={handleShare}>
        <Share2 className="size-3.5" /> Compartir
      </Button>
      {showFavorite && result.id ? (
        <form action={toggleFavoriteContentAction.bind(null, projectId, result.id, !(result.isFavorite ?? false))}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            aria-pressed={Boolean(result.isFavorite)}
            aria-label={result.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
          >
            <Star className={result.isFavorite ? "size-3.5 fill-amber-400 text-amber-400" : "size-3.5"} />
            {result.isFavorite ? "En favoritos" : "Favorito"}
          </Button>
        </form>
      ) : null}
      {showOpenInWorkspace && result.id ? (
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/dashboard/${projectId}/workspace?result=${result.id}`}>Abrir en Workspace</Link>}
        />
      ) : null}
    </div>
  );
}

import {
  toggleFavoriteContentAction,
  duplicateContentAction,
  deleteContentAction,
} from "@/server/actions/content";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { WorkspaceResultActions } from "@/components/workspace/workspace-result-actions";
import { ResultEditForm } from "@/components/workspace/result-edit-form";
import type { WorkspaceResult } from "@/lib/ai-workspace/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

/**
 * One entry in the universal AI results workspace. Every action here either
 * reuses an existing content action verbatim (favorite, edit, duplicate,
 * delete) or is a client-only concern delegated to WorkspaceResultActions
 * (copy/download/share/regenerate) — nothing here is tool-specific, so this
 * same card already works for every AI Center tool, current and future.
 */
export function WorkspaceResultCard({
  projectId,
  result,
  highlighted = false,
}: {
  projectId: string;
  result: WorkspaceResult;
  /** True when this is the result the user arrived to open via ?result=<id> (see the workspace page). */
  highlighted?: boolean;
}) {
  const blocks = parseResultBlocks(result.body);

  return (
    <Card id={result.id} className={highlighted ? "ring-2 ring-primary" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{result.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.toolLabel ? <Badge variant="secondary">{result.toolLabel}</Badge> : null}
              {result.categoryLabel ? <Badge variant="outline">{result.categoryLabel}</Badge> : null}
              <span className="text-xs text-muted-foreground">{result.updatedAt.toLocaleString("es-ES")}</span>
            </div>
          </div>
          <form action={toggleFavoriteContentAction.bind(null, projectId, result.id, !result.isFavorite)}>
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label={result.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
            >
              <Star className={result.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <UniversalResultViewer blocks={blocks} />

        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Editar manualmente</summary>
          <div className="border-t p-3">
            <ResultEditForm projectId={projectId} contentItemId={result.id} title={result.title} body={result.body} />
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <WorkspaceResultActions result={result} projectId={projectId} />
          <div className="flex gap-1">
            <form action={duplicateContentAction.bind(null, projectId, result.id)}>
              <Button type="submit" variant="outline" size="sm">
                Duplicar
              </Button>
            </form>
            <form action={deleteContentAction.bind(null, projectId, result.id)}>
              <Button type="submit" variant="destructive" size="sm">
                Eliminar
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

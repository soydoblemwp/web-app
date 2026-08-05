"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { History, Copy, RotateCcw, GitCompare } from "lucide-react";
import { restoreContentVersionAction, duplicateContentVersionAction } from "@/server/actions/content";
import { diffLines } from "@/lib/editor/text-diff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { VersionSummary } from "@/components/editor/sidebar/types";

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|h1|h2|h3|li|blockquote|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function VersionsTab({
  projectId,
  contentId,
  versions,
  currentTitle,
  currentBody,
  onRestored,
}: {
  projectId: string;
  contentId: string;
  versions: VersionSummary[];
  currentTitle: string;
  currentBody: string;
  onRestored: (title: string, body: string) => void;
}) {
  const router = useRouter();
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const allEntries = [{ id: "__current__", title: currentTitle, body: currentBody, note: null as string | null, createdAt: new Date().toISOString(), authorName: "" }, ...versions];

  function toggleCompare(id: string) {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function handleRestore(versionId: string) {
    setRestoring(true);
    const result = await restoreContentVersionAction(projectId, contentId, versionId);
    setRestoring(false);
    setConfirmRestoreId(null);
    if (result.error || result.title === undefined || result.body === undefined) {
      toast.error(result.error ?? "No se pudo restaurar la versión.");
      return;
    }
    onRestored(result.title, result.body);
    router.refresh();
    toast.success("Versión restaurada.");
  }

  async function handleDuplicate(versionId: string) {
    setDuplicatingId(versionId);
    const result = await duplicateContentVersionAction(projectId, contentId, versionId);
    setDuplicatingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Versión duplicada como nuevo contenido.");
    if (result.id) router.push(`/dashboard/${projectId}/content/${result.id}`);
  }

  const compareEntries = selectedForCompare.map((id) => allEntries.find((e) => e.id === id)).filter(Boolean) as typeof allEntries;
  const diff =
    compareEntries.length === 2
      ? diffLines(stripHtml(compareEntries[0].body), stripHtml(compareEntries[1].body))
      : null;
  const titleChanged = compareEntries.length === 2 && compareEntries[0].title !== compareEntries[1].title;

  if (versions.length === 0) {
    return <p className="text-xs text-muted-foreground">Todavía no hay versiones guardadas. Se crea una automáticamente cada vez que guardes cambios.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Marca hasta dos versiones (o la actual) para comparar.</p>

      <ul className="space-y-1.5">
        {allEntries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2 rounded-md border p-2 text-xs">
            <Checkbox
              checked={selectedForCompare.includes(entry.id)}
              onCheckedChange={() => toggleCompare(entry.id)}
              aria-label="Seleccionar para comparar"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {entry.id === "__current__" ? "Versión actual" : new Date(entry.createdAt).toLocaleString("es-ES")}
              </p>
              {entry.id !== "__current__" ? (
                <p className="text-muted-foreground">
                  {entry.authorName}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              ) : null}
            </div>
            {entry.id !== "__current__" ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Duplicar como nuevo contenido"
                  disabled={duplicatingId === entry.id}
                  onClick={() => handleDuplicate(entry.id)}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" title="Restaurar esta versión" onClick={() => setConfirmRestoreId(entry.id)}>
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            ) : (
              <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
          </li>
        ))}
      </ul>

      {compareEntries.length === 2 ? (
        <div className="space-y-2 rounded-lg border p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <GitCompare className="size-3.5" /> Comparación
          </p>
          {titleChanged ? (
            <p className="text-xs">
              <span className="text-muted-foreground">Título: </span>
              <span className="line-through decoration-destructive/60">{compareEntries[0].title}</span>{" "}
              <span className="text-emerald-600 dark:text-emerald-400">{compareEntries[1].title}</span>
            </p>
          ) : null}
          <div className="max-h-56 overflow-y-auto rounded border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
            {diff?.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap",
                  line.type === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  line.type === "removed" && "bg-destructive/15 text-destructive line-through"
                )}
              >
                {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                {line.value || "⏎"}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog open={confirmRestoreId !== null} onOpenChange={(open) => !open && setConfirmRestoreId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Restaurar versión</DialogTitle>
            <DialogDescription>
              El contenido actual se reemplazará por esta versión. Se guardará automáticamente un punto de restauración con el
              estado actual antes de aplicar el cambio, así que también podrás deshacerlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRestoreId(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={restoring} onClick={() => confirmRestoreId && handleRestore(confirmRestoreId)}>
              {restoring ? "Restaurando..." : "Restaurar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

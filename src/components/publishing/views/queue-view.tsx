"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { GripVertical, Pause, Play, X, RotateCcw } from "lucide-react";
import { reorderPublicationQueueAction, setQueuePausedAction, cancelSchedulingAction, retryPublicationAction } from "@/server/actions/publishing";
import { platformLabel } from "@/lib/publishing/platform-specs";
import { STATUS_LABELS } from "@/lib/publishing/status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PublicationData } from "@/components/publishing/types";

export function QueueView({ projectId, publications }: { projectId: string; publications: PublicationData[] }) {
  const router = useRouter();
  const queued = publications
    .filter((p) => ["SCHEDULED", "PUBLISHING", "FAILED"].includes(p.status))
    .sort((a, b) => (a.queuePosition ?? 999999) - (b.queuePosition ?? 999999));
  const [items, setItems] = useState(queued);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const currentItems = items.length === queued.length ? items : queued;

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const next = [...currentItems];
    const fromIndex = next.findIndex((p) => p.id === draggedId);
    const toIndex = next.findIndex((p) => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    setDraggedId(null);
    void reorderPublicationQueueAction(projectId, next.map((p) => p.id));
  }

  async function togglePause(id: string, paused: boolean) {
    const result = await setQueuePausedAction(projectId, id, !paused);
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  async function handleCancel(id: string) {
    const result = await cancelSchedulingAction(projectId, id);
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  async function handleRetry(id: string) {
    const result = await retryPublicationAction(projectId, id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Reintento programado.");
      router.refresh();
    }
  }

  if (currentItems.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">No hay publicaciones en la cola.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      {currentItems.map((post) => (
        <Card key={post.id} draggable onDragStart={() => setDraggedId(post.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(post.id)} className="cursor-grab">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <Link href={`/dashboard/${projectId}/publishing/${post.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
              {post.internalTitle || "Sin título"}
            </Link>
            <Badge variant="outline">{platformLabel(post.platform)}</Badge>
            <Badge variant={post.status === "FAILED" ? "destructive" : "secondary"}>{STATUS_LABELS[post.status as keyof typeof STATUS_LABELS]}</Badge>
            <span className="text-xs text-muted-foreground">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleString("es-ES") : "Sin fecha"}</span>
            <span className="text-xs text-muted-foreground">Intentos: {post.attemptCount}</span>
            {post.lastErrorMessage ? <span className="max-w-40 truncate text-xs text-destructive" title={post.lastErrorMessage}>{post.lastErrorMessage}</span> : null}
            <div className="flex shrink-0 gap-1">
              {post.status === "FAILED" ? (
                <Button type="button" variant="ghost" size="icon-xs" title="Reintentar" onClick={() => handleRetry(post.id)} disabled={post.isRetryable === false}>
                  <RotateCcw className="size-3.5" />
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="icon-xs" title={post.isPaused ? "Reanudar" : "Pausar"} onClick={() => togglePause(post.id, post.isPaused)}>
                  {post.isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon-xs" title="Cancelar" onClick={() => handleCancel(post.id)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

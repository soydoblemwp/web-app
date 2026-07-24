"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { listLibraryItemsByProject, softDeleteLibraryItem } from "@/lib/guest-storage/library";
import type { LocalLibraryItem, LocalLibraryItemKind } from "@/lib/guest-storage/types";
import { Button } from "@/components/ui/button";

/** Loads this project's saved items of one kind — the "recently saved" list shown under each AI tool form. */
export function useGuestSavedItems(projectId: string | null, kind: LocalLibraryItemKind) {
  const [items, setItems] = useState<LocalLibraryItem[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    const all = await listLibraryItemsByProject(projectId);
    setItems(all.filter((item) => item.kind === kind));
  }, [projectId, kind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function removeItem(id: string) {
    await softDeleteLibraryItem(id);
    await refresh();
  }

  return { items, refresh, removeItem };
}

export function GuestLibraryPanel({
  items,
  onDelete,
}: {
  items: LocalLibraryItem[];
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Guardado en este proyecto ({items.length}) — visible en Biblioteca e Historial también
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium">{item.title || "Sin título"}</p>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar"
                  onClick={async () => {
                    await navigator.clipboard.writeText(item.body);
                    toast.success("Copiado al portapapeles.");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => onDelete(item.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

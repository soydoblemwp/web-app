"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type GuestDraft,
  type GuestTool,
  deleteGuestDraft,
  loadGuestDrafts,
  saveGuestDraft,
} from "@/lib/guest/session-drafts";

/**
 * Shared "results saved in this browser tab for this session" list for
 * every guest AI tool. Reads/writes sessionStorage only — see
 * src/lib/guest/session-drafts.ts. Cleared automatically when the tab or
 * browser closes.
 */
export function useGuestDrafts(tool: GuestTool) {
  const [drafts, setDrafts] = useState<GuestDraft[]>([]);

  useEffect(() => {
    // sessionStorage doesn't exist during SSR, so the initial (empty) render
    // must be reconciled with the real drafts after mount, on the client
    // only — this is the one legitimate case for setting state directly in
    // an effect rather than deriving it from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(loadGuestDrafts(tool));
  }, [tool]);

  function addDraft(title: string, content: string) {
    setDrafts(saveGuestDraft({ tool, title, content }));
  }

  function removeDraft(id: string) {
    setDrafts(deleteGuestDraft(id).filter((d) => d.tool === tool));
  }

  return { drafts, addDraft, removeDraft };
}

export function GuestDraftsPanel({
  drafts,
  onDelete,
}: {
  drafts: GuestDraft[];
  onDelete: (id: string) => void;
}) {
  if (drafts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Guardado en esta sesión del navegador ({drafts.length}) — se perderá al cerrar la pestaña
      </h2>
      <div className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-lg border p-3">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium">{draft.title || "Sin título"}</p>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar"
                  onClick={async () => {
                    await navigator.clipboard.writeText(draft.content);
                    toast.success("Copiado al portapapeles.");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Eliminar"
                  onClick={() => onDelete(draft.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

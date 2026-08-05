"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/components/automations/labels";
import { HANDOFF_STATUS_LABELS, HANDOFF_STATUS_TONE, HANDOFF_PRIORITY_LABELS } from "@/components/customer-support/labels";
import { addHandoffNoteAction, updateHandoffStatusAction } from "@/server/actions/customer-support";

interface HandoffRow {
  id: string;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  sanitizedMessage: string;
  originPage: string | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  createdAt: string;
}

export function HandoffsAdmin({ projectId, isManager, initialHandoffs }: { projectId: string; isManager: boolean; initialHandoffs: HandoffRow[] }) {
  const [handoffs] = useState(initialHandoffs);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    location.reload();
  }

  async function handleStatus(id: string, status: "IN_REVIEW" | "RESOLVED" | "CLOSED") {
    setBusy(id);
    await updateHandoffStatusAction(projectId, id, { status });
    setBusy(null);
    await refresh();
  }

  async function handleNote(id: string) {
    const note = noteDrafts[id]?.trim();
    if (!note) return;
    setBusy(id);
    await addHandoffNoteAction(projectId, id, { note });
    setBusy(null);
    setNoteDrafts({ ...noteDrafts, [id]: "" });
    await refresh();
  }

  return (
    <div className="space-y-3">
      {handoffs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes de atencion humana.</p>
      ) : (
        handoffs.map((h) => (
          <Card key={h.id}>
            <CardContent className="space-y-2 pt-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{h.subject}</span>
                <Badge variant={HANDOFF_STATUS_TONE[h.status] ?? "outline"}>{HANDOFF_STATUS_LABELS[h.status] ?? h.status}</Badge>
                <Badge variant="outline">{HANDOFF_PRIORITY_LABELS[h.priority] ?? h.priority}</Badge>
                {h.category ? <Badge variant="outline">{h.category}</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{h.sanitizedMessage}</p>
              <p className="text-xs text-muted-foreground">Pagina: {h.originPage ?? "-"} · Asignado a: {h.assignedTo?.name ?? h.assignedTo?.email ?? "sin asignar"}</p>
              <div className="flex flex-wrap gap-2">
                {h.status === "OPEN" ? (
                  <Button size="sm" variant="outline" disabled={busy === h.id} onClick={() => handleStatus(h.id, "IN_REVIEW")}>
                    Marcar en revision
                  </Button>
                ) : null}
                {isManager && h.status !== "RESOLVED" && h.status !== "CLOSED" ? (
                  <Button size="sm" disabled={busy === h.id} onClick={() => handleStatus(h.id, "RESOLVED")}>
                    Resolver
                  </Button>
                ) : null}
                {isManager && h.status !== "CLOSED" ? (
                  <Button size="sm" variant="destructive" disabled={busy === h.id} onClick={() => handleStatus(h.id, "CLOSED")}>
                    Cerrar
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2 pt-1">
                <Textarea
                  value={noteDrafts[h.id] ?? ""}
                  onChange={(e) => setNoteDrafts({ ...noteDrafts, [h.id]: e.target.value })}
                  placeholder="Nota interna (nunca visible en el widget)..."
                  rows={2}
                  className="text-xs"
                />
                <Button size="sm" variant="outline" disabled={busy === h.id} onClick={() => handleNote(h.id)}>
                  Agregar nota
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

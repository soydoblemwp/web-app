"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/components/automations/labels";
import { KNOWLEDGE_STATUS_LABELS, KNOWLEDGE_STATUS_TONE, KNOWLEDGE_TYPE_LABELS } from "@/components/customer-support/labels";
import { createManualKnowledgeSourceAction, approveKnowledgeSourceAction, archiveKnowledgeSourceAction, syncKnowledgePathAction } from "@/server/actions/customer-support";

interface SourceRow {
  id: string;
  title: string;
  type: string;
  sourceRef: string;
  status: string;
  visibility: string;
  language: string;
  excerpt: string | null;
  lastSyncedAt: string | null;
}
interface SyncRunRow {
  id: string;
  requestedPath: string;
  status: string;
  changeDetected: boolean;
  errorMessage: string | null;
  createdAt: string;
}

const CUSTOM_PATH_OPTION = "__custom__";

export function KnowledgeAdmin({
  projectId,
  isManager,
  suggestedPaths,
  initialSources,
  initialHistory,
}: {
  projectId: string;
  isManager: boolean;
  suggestedPaths: string[];
  initialSources: SourceRow[];
  initialHistory: SyncRunRow[];
}) {
  const [sources] = useState(initialSources);
  const [history] = useState(initialHistory);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [syncPathSelect, setSyncPathSelect] = useState(suggestedPaths[0] ?? CUSTOM_PATH_OPTION);
  const [customSyncPath, setCustomSyncPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    location.reload();
  }

  async function handleManualCreate() {
    setBusy(true);
    setMessage(null);
    const result = await createManualKnowledgeSourceAction(projectId, { title: manualTitle, content: manualContent });
    setBusy(false);
    if ("error" in result && result.error) {
      setMessage(result.error);
      return;
    }
    setManualTitle("");
    setManualContent("");
    await refresh();
  }

  async function handleSync() {
    const path = syncPathSelect === CUSTOM_PATH_OPTION ? customSyncPath : syncPathSelect;
    if (!path.trim()) {
      setMessage("Escribe una ruta publica real, por ejemplo /precios.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await syncKnowledgePathAction(projectId, { path });
    setBusy(false);
    if ("error" in result && result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(result.changeDetected ? "Sincronizado — se detecto un cambio, revisa y aprueba la fuente." : "Sincronizado — sin cambios.");
    await refresh();
  }

  return (
    <div className="space-y-6">
      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sincronizar pagina interna</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Cualquier ruta publica real del mismo dominio — nunca dominios externos ni rutas privadas (/admin, /dashboard, /api, /login, /register, /verify-email quedan siempre bloqueadas).</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={syncPathSelect} onChange={(e) => setSyncPathSelect(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm">
                {suggestedPaths.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value={CUSTOM_PATH_OPTION}>Otra ruta...</option>
              </select>
              {syncPathSelect === CUSTOM_PATH_OPTION ? (
                <Input value={customSyncPath} onChange={(e) => setCustomSyncPath(e.target.value)} placeholder="/precios" className="w-48" />
              ) : null}
              <Button size="sm" onClick={handleSync} disabled={busy}>
                Sincronizar
              </Button>
            </div>
            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fuente manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Titulo</Label>
              <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} maxLength={300} />
            </div>
            <div className="space-y-1">
              <Label>Contenido</Label>
              <Textarea value={manualContent} onChange={(e) => setManualContent(e.target.value)} rows={5} maxLength={50000} />
            </div>
            <Button size="sm" onClick={handleManualCreate} disabled={busy || !manualTitle.trim() || !manualContent.trim()}>
              Crear borrador
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay fuentes de conocimiento.</p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <Badge variant={KNOWLEDGE_STATUS_TONE[s.status] ?? "outline"}>{KNOWLEDGE_STATUS_LABELS[s.status] ?? s.status}</Badge>
                  <Badge variant="outline">{KNOWLEDGE_TYPE_LABELS[s.type] ?? s.type}</Badge>
                  <Badge variant="outline">{s.visibility}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{s.excerpt ?? ""}</p>
                <p className="text-xs text-muted-foreground">Ultima sync: {s.lastSyncedAt ? formatDateTime(s.lastSyncedAt) : "nunca"}</p>
                {isManager ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {s.status !== "APPROVED" ? (
                      <Button size="sm" onClick={() => approveKnowledgeSourceAction(projectId, s.id, {}).then(refresh)}>
                        Aprobar
                      </Button>
                    ) : null}
                    {s.status !== "ARCHIVED" ? (
                      <Button size="sm" variant="destructive" onClick={() => archiveKnowledgeSourceAction(projectId, s.id).then(refresh)}>
                        Archivar
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de sincronizacion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sincronizaciones registradas.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-xs last:border-b-0">
                <span>{h.requestedPath}</span>
                <Badge variant="outline">{h.status}</Badge>
                {h.changeDetected ? <Badge variant="secondary">Cambio detectado</Badge> : null}
                {h.errorMessage ? <span className="text-destructive">{h.errorMessage}</span> : null}
                <span className="ml-auto text-muted-foreground">{formatDateTime(h.createdAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

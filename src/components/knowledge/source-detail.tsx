"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Archive, RefreshCw, AlertTriangle, ExternalLink, FileText } from "lucide-react";
import { setSourceArchivedAction, deleteSourceAction, syncSourceAction, addPastedTextVersionAction, setActiveVersionAction } from "@/server/actions/knowledge-sources";
import { addSourceToCollectionAction, removeSourceFromCollectionAction } from "@/server/actions/knowledge-collections";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ProcessingDriver } from "@/components/knowledge/processing-driver";
import { SOURCE_STATUS_LABELS, SOURCE_FORMAT_LABELS, ORIGIN_TYPE_LABELS, isTerminalSourceStatus } from "@/components/knowledge/labels";
import { getActionErrorMessage } from "@/lib/knowledge/action-result";

export interface SourceDetailData {
  id: string;
  title: string;
  description: string | null;
  format: string;
  status: string;
  originType: string;
  syncMode: string;
  isArchived: boolean;
  sensitiveWarning: boolean;
  lastErrorMessage: string | null;
  fileAsset: { id: string; originalName: string; url: string } | null;
  activeVersion: {
    id: string;
    version: number;
    status: string;
    extractionQuality: string | null;
    warnings: string[];
    pageCount: number | null;
    sectionCount: number | null;
    charCount: number;
    normalizedText: string | null;
    chunkCount: number;
  } | null;
  versions: { id: string; version: number; status: string; createdAt: string; chunkCount: number }[];
  collections: { collectionId: string; name: string }[];
}

export function SourceDetail({
  projectId,
  source,
  allCollections,
}: {
  projectId: string;
  source: SourceDetailData;
  allCollections: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [newVersionText, setNewVersionText] = useState("");
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canSync = source.originType !== "PASTED_TEXT" && source.originType !== "FILE" && source.originType !== "NOTE";
  const canAddVersion = source.originType === "PASTED_TEXT" || source.originType === "NOTE";
  const attachedIds = new Set(source.collections.map((c) => c.collectionId));

  async function handleArchive() {
    await setSourceArchivedAction(projectId, source.id, !source.isArchived);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteSourceAction(projectId, source.id);
    setDeleting(false);
    const message = getActionErrorMessage(result);
    if (message) {
      toast.error(message);
      return;
    }
    toast.success("Fuente eliminada.");
    router.push(`/dashboard/${projectId}/knowledge`);
  }

  async function handleSync() {
    const result = await syncSourceAction(projectId, source.id);
    const message = getActionErrorMessage(result);
    if (message) toast.error(message);
    else {
      toast.success("Sincronizado — se procesará la nueva versión si hubo cambios.");
      router.refresh();
    }
  }

  async function handleAddVersion() {
    if (!newVersionText.trim()) return;
    const result = await addPastedTextVersionAction(projectId, source.id, newVersionText);
    const message = getActionErrorMessage(result);
    if (message) {
      toast.error(message);
      return;
    }
    toast.success("Nueva versión creada — procesándola ahora.");
    setNewVersionText("");
    setShowNewVersion(false);
    router.refresh();
  }

  async function toggleCollection(collectionId: string) {
    if (attachedIds.has(collectionId)) await removeSourceFromCollectionAction(projectId, collectionId, source.id);
    else await addSourceToCollectionAction(projectId, collectionId, source.id);
    router.refresh();
  }

  async function handleSetActiveVersion(versionId: string) {
    const result = await setActiveVersionAction(projectId, source.id, versionId);
    const message = getActionErrorMessage(result);
    if (message) toast.error(message);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href={`/dashboard/${projectId}/knowledge`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Knowledge Base
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <span className="truncate">{source.title}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{SOURCE_FORMAT_LABELS[source.format] ?? source.format}</Badge>
            <Badge variant={source.status === "FAILED" || source.status === "NEEDS_OCR" ? "destructive" : "secondary"}>{SOURCE_STATUS_LABELS[source.status] ?? source.status}</Badge>
            <Badge variant="outline">{ORIGIN_TYPE_LABELS[source.originType] ?? source.originType}</Badge>
            {source.isArchived ? <Badge variant="outline">Archivada</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {source.fileAsset ? (
            <Button type="button" variant="outline" size="sm" render={<a href={source.fileAsset.url} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="size-3.5" /> Ver archivo original
            </Button>
          ) : null}
          {canSync ? (
            <Button type="button" variant="outline" size="sm" onClick={handleSync}>
              <RefreshCw className="size-3.5" /> Sincronizar
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={handleArchive}>
            <Archive className="size-3.5" /> {source.isArchived ? "Restaurar" : "Archivar"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="size-3.5" /> Eliminar
          </Button>
        </div>
      </div>

      {source.description ? <p className="text-sm text-muted-foreground">{source.description}</p> : null}

      {source.sensitiveWarning ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-start gap-2 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Esta fuente parece contener un patrón sensible (clave, token o credencial). Revisa el contenido antes de compartirlo ampliamente — no se eliminó nada automáticamente.
          </CardContent>
        </Card>
      ) : null}

      {!isTerminalSourceStatus(source.status) || source.status === "FAILED" || source.status === "NEEDS_OCR" ? (
        <ProcessingDriver projectId={projectId} sourceId={source.id} status={source.status} />
      ) : null}

      {source.activeVersion ? (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-medium">Versión activa (v{source.activeVersion.version})</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Caracteres" value={source.activeVersion.charCount.toLocaleString("es")} />
              <Stat label="Fragmentos" value={String(source.activeVersion.chunkCount)} />
              <Stat label="Calidad de extracción" value={source.activeVersion.extractionQuality ?? "—"} />
              {source.activeVersion.pageCount !== null ? <Stat label="Páginas" value={String(source.activeVersion.pageCount)} /> : null}
              {source.activeVersion.sectionCount !== null ? <Stat label="Secciones" value={String(source.activeVersion.sectionCount)} /> : null}
            </div>
            {source.activeVersion.warnings.length > 0 ? (
              <div className="space-y-1 rounded-lg bg-muted p-2 text-xs">
                {source.activeVersion.warnings.map((w, i) => (
                  <p key={i}>⚠ {w}</p>
                ))}
              </div>
            ) : null}
            {source.activeVersion.normalizedText ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver texto extraído</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">{source.activeVersion.normalizedText}</pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canAddVersion ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            {showNewVersion ? (
              <>
                <Textarea rows={6} value={newVersionText} onChange={(e) => setNewVersionText(e.target.value)} placeholder="Pega el contenido actualizado..." />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleAddVersion}>
                    Guardar como nueva versión
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewVersion(false)}>
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setShowNewVersion(true)}>
                Añadir nueva versión
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-2 py-4">
          <p className="text-sm font-medium">Versiones ({source.versions.length})</p>
          <div className="space-y-1">
            {source.versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                <span>
                  v{v.version} — {SOURCE_STATUS_LABELS[v.status] ?? v.status} — {v.chunkCount} fragmentos
                </span>
                {v.id !== source.activeVersion?.id ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleSetActiveVersion(v.id)}>
                    Usar como activa
                  </Button>
                ) : (
                  <Badge variant="secondary">Activa</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {allCollections.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-medium">Colecciones</p>
            <div className="flex flex-wrap gap-2">
              {allCollections.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={attachedIds.has(c.id)} onCheckedChange={() => toggleCollection(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

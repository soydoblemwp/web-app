"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, LayoutGrid, List as ListIcon, MessageCircleQuestion, FolderPlus, Archive, Trash2, MoreVertical, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NewSourceDialog } from "@/components/knowledge/new-source-dialog";
import { CollectionDialog, type EditableCollection } from "@/components/knowledge/collection-dialog";
import { CollectionIcon } from "@/components/knowledge/collection-icon";
import { SOURCE_STATUS_LABELS, SOURCE_FORMAT_LABELS, isProcessingSourceStatus } from "@/components/knowledge/labels";
import { setSourceArchivedAction, deleteSourceAction } from "@/server/actions/knowledge-sources";
import { setCollectionStatusAction, deleteCollectionAction } from "@/server/actions/knowledge-collections";
import { cn } from "@/lib/utils";
import { getActionErrorMessage } from "@/lib/knowledge/action-result";

export interface KnowledgeSourceListItem {
  id: string;
  title: string;
  format: string;
  status: string;
  originType: string;
  isArchived: boolean;
  updatedAt: string;
  charCount: number;
  versionCount: number;
  collectionIds: string[];
}

export interface KnowledgeCollectionListItem {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: string;
  sourceCount: number;
}

export function KnowledgeHub({
  projectId,
  sources,
  collections,
  initialCollectionFilter,
}: {
  projectId: string;
  sources: KnowledgeSourceListItem[];
  collections: KnowledgeCollectionListItem[];
  initialCollectionFilter?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [collectionFilter, setCollectionFilter] = useState(initialCollectionFilter ?? "ALL");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [showArchived, setShowArchived] = useState(false);
  const [newSourceOpen, setNewSourceOpen] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState<{ open: boolean; collection: EditableCollection | null }>({ open: false, collection: null });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = sources.filter((s) => {
    if (!showArchived && s.isArchived) return false;
    if (statusFilter === "PROCESSING" && !isProcessingSourceStatus(s.status)) return false;
    else if (statusFilter !== "ALL" && statusFilter !== "PROCESSING" && s.status !== statusFilter) return false;
    if (collectionFilter !== "ALL" && !s.collectionIds.includes(collectionFilter)) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = useMemo(
    () => ({
      total: sources.length,
      processing: sources.filter((s) => isProcessingSourceStatus(s.status)).length,
      ready: sources.filter((s) => s.status === "READY" || s.status === "PARTIALLY_READY").length,
      failed: sources.filter((s) => s.status === "FAILED" || s.status === "NEEDS_OCR").length,
      archived: sources.filter((s) => s.isArchived).length,
    }),
    [sources]
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkArchive(archived: boolean) {
    for (const id of selected) await setSourceArchivedAction(projectId, id, archived);
    toast.success(archived ? "Fuentes archivadas." : "Fuentes restauradas.");
    setSelected(new Set());
    router.refresh();
  }

  async function handleDeleteCollection(id: string) {
    const result = await deleteCollectionAction(projectId, id);
    const message = getActionErrorMessage(result);
    if (message) toast.error(message);
    else {
      toast.success("Colección eliminada.");
      router.refresh();
    }
  }

  async function handleArchiveCollection(id: string, archived: boolean) {
    await setCollectionStatusAction(projectId, id, archived ? "ARCHIVED" : "ACTIVE");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fuentes totales" value={stats.total} />
        <StatCard label="Procesando" value={stats.processing} />
        <StatCard label="Listas" value={stats.ready} />
        <StatCard label="Con error" value={stats.failed} tone={stats.failed > 0 ? "destructive" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setNewSourceOpen(true)}>
          <Plus className="size-4" /> Añadir fuente
        </Button>
        <Button type="button" variant="outline" render={<Link href={`/dashboard/${projectId}/knowledge/ask`} />}>
          <MessageCircleQuestion className="size-4" /> Preguntar a la base de conocimiento
        </Button>
        <Button type="button" variant="outline" onClick={() => setCollectionDialog({ open: true, collection: null })}>
          <FolderPlus className="size-4" /> Nueva colección
        </Button>
      </div>

      {collections.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Colecciones</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {collections.map((c) => (
              <Card key={c.id} className={cn(c.status === "ARCHIVED" && "opacity-60")}>
                <CardContent className="flex items-center gap-2 py-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setCollectionFilter(c.id)}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}22`, color: c.color }}>
                      <CollectionIcon name={c.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.sourceCount} fuentes</span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button type="button" variant="ghost" size="icon-sm">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setCollectionDialog({ open: true, collection: c })}>Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchiveCollection(c.id, c.status !== "ARCHIVED")}>
                        {c.status === "ARCHIVED" ? "Reactivar" : "Archivar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDeleteCollection(c.id)}>
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar fuentes..." className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Estado: todos</SelectItem>
              <SelectItem value="PROCESSING">Procesando</SelectItem>
              <SelectItem value="READY">Listas</SelectItem>
              <SelectItem value="PARTIALLY_READY">Parcialmente listas</SelectItem>
              <SelectItem value="FAILED">Con error</SelectItem>
              <SelectItem value="NEEDS_OCR">Requiere OCR</SelectItem>
            </SelectContent>
          </Select>
          <Select value={collectionFilter} onValueChange={(v) => v && setCollectionFilter(v)}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Colección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Colección: todas</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={showArchived} onCheckedChange={() => setShowArchived((v) => !v)} /> Ver archivadas
          </label>
          <div className="ml-auto flex gap-1 rounded-lg border p-1">
            <Button type="button" variant={view === "cards" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("cards")}>
              <LayoutGrid className="size-4" />
            </Button>
            <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("list")}>
              <ListIcon className="size-4" />
            </Button>
          </div>
        </div>

        {selected.size > 0 ? (
          <Card className="border-primary/40">
            <CardContent className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span>{selected.size} seleccionadas</span>
              <Button type="button" size="sm" variant="outline" onClick={() => bulkArchive(true)}>
                <Archive className="size-3.5" /> Archivar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Cancelar
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {sources.length === 0 ? "Todavía no hay fuentes en este proyecto. Añade la primera." : "Ninguna fuente coincide con los filtros."}
            </CardContent>
          </Card>
        ) : (
          <div className={view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1.5"}>
            {filtered.map((s) => (
              <SourceCard key={s.id} projectId={projectId} source={s} compact={view === "list"} checked={selected.has(s.id)} onToggle={() => toggleSelected(s.id)} />
            ))}
          </div>
        )}
      </section>

      <NewSourceDialog projectId={projectId} open={newSourceOpen} onOpenChange={setNewSourceOpen} collections={collections.map((c) => ({ id: c.id, name: c.name }))} defaultCollectionId={initialCollectionFilter} />
      <CollectionDialog
        key={collectionDialog.collection?.id ?? "new"}
        projectId={projectId}
        open={collectionDialog.open}
        onOpenChange={(open) => setCollectionDialog((prev) => ({ ...prev, open }))}
        collection={collectionDialog.collection}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "destructive" }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-xl font-semibold", tone === "destructive" && value > 0 && "text-destructive")}>{value}</p>
      </CardContent>
    </Card>
  );
}

async function handleDeleteSource(projectId: string, id: string, router: ReturnType<typeof useRouter>) {
  const result = await deleteSourceAction(projectId, id);
  const message = getActionErrorMessage(result);
  if (message) toast.error(message);
  else {
    toast.success("Fuente eliminada.");
    router.refresh();
  }
}

function SourceCard({
  projectId,
  source,
  compact,
  checked,
  onToggle,
}: {
  projectId: string;
  source: KnowledgeSourceListItem;
  compact?: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const statusTone = source.status === "FAILED" || source.status === "NEEDS_OCR" ? "destructive" : source.status === "READY" ? "secondary" : "outline";

  return (
    <Card>
      <CardContent className={cn("space-y-2", compact ? "flex flex-wrap items-center gap-3 py-2.5 space-y-0" : "py-4")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Checkbox checked={checked} onCheckedChange={onToggle} />
            <Link href={`/dashboard/${projectId}/knowledge/sources/${source.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 font-medium hover:underline">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{source.title}</span>
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button type="button" variant="ghost" size="icon-sm">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSourceArchivedAction(projectId, source.id, !source.isArchived).then(() => router.refresh())}>
                {source.isArchived ? "Restaurar" : "Archivar"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => handleDeleteSource(projectId, source.id, router)}>
                <Trash2 className="size-3.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{SOURCE_FORMAT_LABELS[source.format] ?? source.format}</Badge>
          <Badge variant={statusTone as never}>{SOURCE_STATUS_LABELS[source.status] ?? source.status}</Badge>
          {source.collectionIds.length > 0 ? <Badge variant="outline">{source.collectionIds.length} colecciones</Badge> : null}
        </div>
      </CardContent>
    </Card>
  );
}

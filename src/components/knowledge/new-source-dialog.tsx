"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, FileText, Type, Link2 } from "lucide-react";
import { createPastedSourceAction, createFileSourceAction } from "@/server/actions/knowledge-sources";
import { createInternalSourceAction } from "@/server/actions/knowledge-sources";
import { addSourceToCollectionAction } from "@/server/actions/knowledge-collections";
import { listContentItemsForSelectAction } from "@/server/actions/publishing-select";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

type Kind = "text" | "file" | "internal";
type InternalOrigin = "CONTENT_ITEM" | "CAMPAIGN";

export function NewSourceDialog({
  projectId,
  open,
  onOpenChange,
  collections,
  defaultCollectionId,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: { id: string; name: string }[];
  defaultCollectionId?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"TEXT" | "MARKDOWN" | "CSV" | "JSON" | "HTML">("TEXT");
  const [file, setFile] = useState<File | null>(null);
  const [origin, setOrigin] = useState<InternalOrigin>("CONTENT_ITEM");
  const [internalId, setInternalId] = useState("");
  const [contentItems, setContentItems] = useState<{ id: string; title: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(defaultCollectionId ? [defaultCollectionId] : []);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<{ sourceId: string; title: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    listContentItemsForSelectAction(projectId).then(setContentItems);
    listCampaignsForSelectAction(projectId).then((c) => setCampaigns(c.map((x) => ({ id: x.id, name: x.name }))));
  }, [open, projectId]);

  function reset() {
    setTitle("");
    setDescription("");
    setText("");
    setFile(null);
    setInternalId("");
    setDuplicateOf(null);
    setSelectedCollectionIds(defaultCollectionId ? [defaultCollectionId] : []);
  }

  async function afterCreate(id: string) {
    for (const collectionId of selectedCollectionIds) {
      if (collectionId === defaultCollectionId) continue;
      await addSourceToCollectionAction(projectId, collectionId, id);
    }
    toast.success("Fuente añadida — procesándola ahora.");
    onOpenChange(false);
    reset();
    router.push(`/dashboard/${projectId}/knowledge/sources/${id}`);
  }

  async function handleSubmit(forceCreate = false) {
    setSubmitting(true);
    setDuplicateOf(null);
    try {
      if (kind === "text") {
        if (!title.trim() || !text.trim()) {
          toast.error("Título y contenido son obligatorios.");
          return;
        }
        const result = await createPastedSourceAction(projectId, { title, description, text, format, collectionIds: selectedCollectionIds }, forceCreate);
        if ("duplicateOf" in result && result.duplicateOf) {
          setDuplicateOf(result.duplicateOf);
          return;
        }
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        await afterCreate(result.id!);
      } else if (kind === "file") {
        if (!file) {
          toast.error("Selecciona un archivo.");
          return;
        }
        const formData = new FormData();
        formData.set("file", file);
        formData.set("title", title || file.name);
        formData.set("description", description);
        formData.set("collectionIds", selectedCollectionIds.join(","));
        const result = await createFileSourceAction(projectId, formData, forceCreate);
        if ("duplicateOf" in result && result.duplicateOf) {
          setDuplicateOf(result.duplicateOf);
          return;
        }
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        await afterCreate(result.id!);
      } else {
        if (!internalId) {
          toast.error("Selecciona un recurso.");
          return;
        }
        const input = { originType: origin, title: title || undefined, collectionIds: selectedCollectionIds, syncMode: "MANUAL" as const, ...(origin === "CONTENT_ITEM" ? { contentItemId: internalId } : { campaignId: internalId }) };
        const result = await createInternalSourceAction(projectId, input, forceCreate);
        if ("duplicateOf" in result && result.duplicateOf) {
          setDuplicateOf(result.duplicateOf);
          return;
        }
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        await afterCreate(result.id!);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir fuente</DialogTitle>
          <DialogDescription>Texto pegado, un archivo, o un recurso ya existente del proyecto.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border p-1">
          <Button type="button" size="sm" variant={kind === "text" ? "secondary" : "ghost"} className="flex-1" onClick={() => setKind("text")}>
            <Type className="size-3.5" /> Texto
          </Button>
          <Button type="button" size="sm" variant={kind === "file" ? "secondary" : "ghost"} className="flex-1" onClick={() => setKind("file")}>
            <FileText className="size-3.5" /> Archivo
          </Button>
          <Button type="button" size="sm" variant={kind === "internal" ? "secondary" : "ghost"} className="flex-1" onClick={() => setKind("internal")}>
            <Link2 className="size-3.5" /> Recurso del proyecto
          </Button>
        </div>

        {duplicateOf ? (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 py-3 text-sm">
              <p>Ya existe una fuente idéntica: <strong>{duplicateOf.title}</strong>.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => afterCreate(duplicateOf.sourceId)}>
                  Reutilizar existente
                </Button>
                <Button type="button" size="sm" onClick={() => handleSubmit(true)} disabled={submitting}>
                  Crear de todas formas
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {kind !== "internal" ? (
              <div className="space-y-1.5">
                <Label htmlFor="src-title">Título</Label>
                <Input id="src-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre de la fuente" />
              </div>
            ) : null}

            {kind === "text" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="src-format">Formato</Label>
                  <Select value={format} onValueChange={(v) => v && setFormat(v as typeof format)}>
                    <SelectTrigger id="src-format" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Texto plano</SelectItem>
                      <SelectItem value="MARKDOWN">Markdown</SelectItem>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="JSON">JSON</SelectItem>
                      <SelectItem value="HTML">HTML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="src-text">Contenido</Label>
                  <Textarea id="src-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega el contenido aquí..." />
                </div>
              </>
            ) : null}

            {kind === "file" ? (
              <div className="space-y-1.5">
                <Label htmlFor="src-file">Archivo (TXT, MD, CSV, JSON, HTML, DOCX, PDF)</Label>
                <input
                  id="src-file"
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.docx,.pdf,text/plain,text/markdown,text/csv,application/json,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                />
                <p className="text-xs text-muted-foreground">Para imágenes o PDF escaneado sin capa de texto, la fuente quedará marcada como &quot;Requiere OCR&quot; — no se inventa contenido.</p>
              </div>
            ) : null}

            {kind === "internal" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de recurso</Label>
                  <Select value={origin} onValueChange={(v) => { if (v) { setOrigin(v as InternalOrigin); setInternalId(""); } }}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONTENT_ITEM">Contenido existente</SelectItem>
                      <SelectItem value="CAMPAIGN">Campaña</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{origin === "CONTENT_ITEM" ? "Contenido" : "Campaña"}</Label>
                  <Select value={internalId} onValueChange={(v) => v && setInternalId(v)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Selecciona uno" />
                    </SelectTrigger>
                    <SelectContent>
                      {(origin === "CONTENT_ITEM" ? contentItems : campaigns).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {"title" in item ? item.title : item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {kind !== "internal" ? (
              <div className="space-y-1.5">
                <Label htmlFor="src-description">Descripción (opcional)</Label>
                <Input id="src-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            ) : null}

            {collections.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Colecciones</Label>
                <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                  {collections.map((c) => {
                    const checked = selectedCollectionIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => setSelectedCollectionIds((prev) => (checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]))}
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!duplicateOf ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null} Añadir fuente
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

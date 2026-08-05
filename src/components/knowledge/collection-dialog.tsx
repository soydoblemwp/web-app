"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createCollectionAction, updateCollectionAction } from "@/server/actions/knowledge-collections";
import { KNOWLEDGE_COLLECTION_ICON_NAMES, KNOWLEDGE_COLLECTION_COLORS } from "@/lib/knowledge/collection-icons";
import { CollectionIcon } from "@/components/knowledge/collection-icon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface EditableCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
}

export function CollectionDialog({
  projectId,
  open,
  onOpenChange,
  collection,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: EditableCollection | null;
}) {
  const router = useRouter();
  // Keyed by the target collection below, so opening for a different collection (or for "new") always starts from fresh initial state — no effect-based reset needed.
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [icon, setIcon] = useState<string>(collection?.icon ?? "Folder");
  const [color, setColor] = useState<string>(collection?.color ?? KNOWLEDGE_COLLECTION_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    const input = { name, description, icon, color };
    const result = collection ? await updateCollectionAction(projectId, collection.id, input) : await createCollectionAction(projectId, input);
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(collection ? "Colección actualizada." : "Colección creada.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{collection ? "Editar colección" : "Nueva colección"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="col-name">Nombre</Label>
            <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Investigación" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-desc">Descripción (opcional)</Label>
            <Textarea id="col-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Icono</Label>
            <div className="flex flex-wrap gap-1.5">
              {KNOWLEDGE_COLLECTION_ICON_NAMES.map((name_) => (
                <button
                  key={name_}
                  type="button"
                  onClick={() => setIcon(name_)}
                  className={cn("flex size-8 items-center justify-center rounded-lg border", icon === name_ && "border-primary bg-primary/10")}
                >
                  <CollectionIcon name={name_} className="size-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {KNOWLEDGE_COLLECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn("size-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

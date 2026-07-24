"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import { getLocalBrandKit, saveLocalBrandKit } from "@/lib/guest-storage/brand-kit";
import type { LocalBrandTerm } from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const emptyForm = {
  isActiveForAI: true,
  name: "",
  tagline: "",
  tone: "",
  personality: "",
  valueProposition: "",
  commonCTAs: "",
  additionalNotes: "",
};

export function GuestBrandKitForm() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [form, setForm] = useState(emptyForm);
  const [terms, setTerms] = useState<LocalBrandTerm[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!selectedId) {
        setForm(emptyForm);
        setTerms([]);
        return;
      }
      const brandKit = await getLocalBrandKit(selectedId);
      if (brandKit) {
        setForm({
          isActiveForAI: brandKit.isActiveForAI,
          name: brandKit.name,
          tagline: brandKit.tagline,
          tone: brandKit.tone,
          personality: brandKit.personality,
          valueProposition: brandKit.valueProposition,
          commonCTAs: brandKit.commonCTAs,
          additionalNotes: brandKit.additionalNotes,
        });
        setTerms(brandKit.terms);
      } else {
        setForm(emptyForm);
        setTerms([]);
      }
    })();
  }, [selectedId]);

  function addTerm(isForbidden: boolean) {
    if (!newTerm.trim()) return;
    setTerms((prev) => [...prev, { term: newTerm.trim(), isForbidden }]);
    setNewTerm("");
  }

  function removeTerm(index: number) {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!selectedId) return;
    setIsSaving(true);
    await saveLocalBrandKit({ projectId: selectedId, ...form, terms });
    setIsSaving(false);
    toast.success("Kit de marca guardado localmente.");
  }

  if (isLoadingProjects) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <GuestProjectSelect
        projects={projects}
        selectedId={selectedId}
        onSelect={selectProject}
        onCreated={async (p) => {
          await refreshProjects();
          selectProject(p.id);
        }}
      />

      {selectedId ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Switch checked={form.isActiveForAI} onCheckedChange={(checked) => setForm({ ...form, isActiveForAI: checked })} />
            <Label className="flex-1">Aplicar este kit de marca a las herramientas de IA local</Label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre de marca</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>Eslogan</Label>
              <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={300} />
            </div>
            <div className="space-y-2">
              <Label>Tono</Label>
              <Input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>Personalidad</Label>
              <Input value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} maxLength={300} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Propuesta de valor</Label>
              <Textarea
                value={form.valueProposition}
                onChange={(e) => setForm({ ...form, valueProposition: e.target.value })}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Llamadas a la acción habituales</Label>
              <Input value={form.commonCTAs} onChange={(e) => setForm({ ...form, commonCTAs: e.target.value })} maxLength={300} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notas adicionales para la IA</Label>
              <Textarea
                value={form.additionalNotes}
                onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
                rows={3}
                maxLength={1000}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Palabras preferidas / prohibidas</Label>
            <div className="flex flex-wrap gap-2">
              {terms.map((term, index) => (
                <Badge key={`${term.term}-${index}`} variant={term.isForbidden ? "destructive" : "secondary"}>
                  {term.term}
                  <button type="button" onClick={() => removeTerm(index)} aria-label="Quitar" className="ml-1">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                maxLength={60}
                placeholder="Nueva palabra"
                className="w-48"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => addTerm(false)}>
                Añadir preferida
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTerm(true)}>
                Añadir prohibida
              </Button>
            </div>
          </div>

          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar kit de marca"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para configurar su kit de marca.</p>
      )}
    </div>
  );
}

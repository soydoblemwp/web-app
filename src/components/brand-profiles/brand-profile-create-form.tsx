"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createBrandProfileAction } from "@/server/actions/brand-profiles";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { Button } from "@/components/ui/button";
import { BrandProfileField } from "@/components/brand-profiles/brand-profile-fields";

/** "Nuevo Brand Kit" — the creation path for the multi-profile Brand Kit system. Reuses parseTagsInput from Prompt Library instead of redefining comma-list parsing. */
export function BrandProfileCreateForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "");
    const list = (name: string) => parseTagsInput(text(name));

    const result = await createBrandProfileAction({
      projectId,
      name: text("name"),
      description: text("description"),
      mission: text("mission"),
      vision: text("vision"),
      values: list("values"),
      targetAudience: text("targetAudience"),
      tone: text("tone"),
      personality: text("personality"),
      primaryLanguage: text("primaryLanguage"),
      country: text("country"),
      allowedWords: list("allowedWords"),
      forbiddenWords: list("forbiddenWords"),
      writingStyle: text("writingStyle"),
      preferredCTAs: list("preferredCTAs"),
      socialLinks: list("socialLinks"),
      website: text("website"),
      email: text("email"),
      colors: list("colors"),
      typography: text("typography"),
      logoUrl: text("logoUrl"),
      internalNotes: text("internalNotes"),
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Brand Kit guardado.");
    event.currentTarget.reset();
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo Brand Kit
      </Button>
    );
  }

  const p = "new-brand-kit";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <BrandProfileField idPrefix={p} label="Nombre de la marca" name="name" required />
        <BrandProfileField idPrefix={p} label="Idioma principal" name="primaryLanguage" placeholder="ej. es" />
        <BrandProfileField idPrefix={p} label="Descripción" name="description" textarea className="sm:col-span-2" />
        <BrandProfileField idPrefix={p} label="Misión" name="mission" textarea />
        <BrandProfileField idPrefix={p} label="Visión" name="vision" textarea />
        <BrandProfileField idPrefix={p} label="Valores (separados por coma)" name="values" placeholder="honestidad, innovación" />
        <BrandProfileField idPrefix={p} label="Público objetivo" name="targetAudience" textarea />
        <BrandProfileField idPrefix={p} label="Tono de comunicación" name="tone" placeholder="cercano, profesional..." />
        <BrandProfileField idPrefix={p} label="Personalidad" name="personality" />
        <BrandProfileField idPrefix={p} label="País" name="country" />
        <BrandProfileField idPrefix={p} label="Estilo de escritura" name="writingStyle" />
        <BrandProfileField
          idPrefix={p}
          label="Palabras permitidas (separadas por coma)"
          name="allowedWords"
          placeholder="innovador, cercano"
        />
        <BrandProfileField
          idPrefix={p}
          label="Palabras prohibidas (separadas por coma)"
          name="forbiddenWords"
          placeholder="barato, low-cost"
        />
        <BrandProfileField
          idPrefix={p}
          label="CTA preferidos (separados por coma)"
          name="preferredCTAs"
          placeholder="Compra ahora, Descúbrelo"
        />
        <BrandProfileField
          idPrefix={p}
          label="Redes sociales (separadas por coma)"
          name="socialLinks"
          placeholder="instagram.com/marca, x.com/marca"
        />
        <BrandProfileField idPrefix={p} label="Sitio web" name="website" placeholder="https://..." />
        <BrandProfileField idPrefix={p} label="Email" name="email" />
        <BrandProfileField idPrefix={p} label="Colores (hex, separados por coma)" name="colors" placeholder="#111827, #F97316" />
        <BrandProfileField idPrefix={p} label="Tipografía" name="typography" />
        <BrandProfileField idPrefix={p} label="Logo (referencia, sin subir imagen)" name="logoUrl" placeholder="https://.../logo.png" />
        <BrandProfileField idPrefix={p} label="Notas internas" name="internalNotes" textarea className="sm:col-span-2" />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar Brand Kit"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import {
  updateBrandProfileAction,
  deleteBrandProfileAction,
  duplicateBrandProfileAction,
  setDefaultBrandProfileAction,
} from "@/server/actions/brand-profiles";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { BrandProfileField } from "@/components/brand-profiles/brand-profile-fields";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * One entry in the Brand Kit hub. Reuses UniversalResultViewer to show
 * exactly the AI context text (buildBrandProfileContext) this profile will
 * inject into a generation — the same visual system every generated result
 * and every Prompt Library/AI Templates entry already renders through.
 */
export function BrandProfileCard({ projectId, profile }: { projectId: string; profile: BrandProfileLike }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);

  const contextText = useMemo(() => buildBrandProfileContext(profile), [profile]);
  const contextBlocks = useMemo(() => parseResultBlocks(contextText), [contextText]);

  async function handleSetDefault() {
    setBusy(true);
    const result = await setDefaultBrandProfileAction(projectId, profile.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleDuplicate() {
    setBusy(true);
    const result = await duplicateBrandProfileAction(projectId, profile.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
    else toast.success("Brand Kit duplicado.");
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteBrandProfileAction(projectId, profile.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "");
    const list = (name: string) => parseTagsInput(text(name));

    const result = await updateBrandProfileAction(projectId, profile.id, {
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

    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Brand Kit actualizado.");
    setMode("view");
  }

  const p = `brand-kit-${profile.id}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{profile.name}</CardTitle>
            {profile.description ? <p className="text-sm text-muted-foreground">{profile.description}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {profile.isDefault ? <Badge>Predeterminado</Badge> : null}
              {profile.tone ? <Badge variant="secondary">{profile.tone}</Badge> : null}
              {profile.colors.map((color) => (
                <Badge key={color} variant="outline">
                  {color}
                </Badge>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy || profile.isDefault}
            onClick={handleSetDefault}
            aria-label={profile.isDefault ? "Ya es el Brand Kit predeterminado" : "Marcar como predeterminado"}
          >
            <Star className={profile.isDefault ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "edit" ? (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <BrandProfileField idPrefix={p} label="Nombre de la marca" name="name" defaultValue={profile.name} required />
              <BrandProfileField idPrefix={p} label="Idioma principal" name="primaryLanguage" defaultValue={profile.primaryLanguage ?? ""} />
              <BrandProfileField idPrefix={p} label="Descripción" name="description" defaultValue={profile.description ?? ""} textarea className="sm:col-span-2" />
              <BrandProfileField idPrefix={p} label="Misión" name="mission" defaultValue={profile.mission ?? ""} textarea />
              <BrandProfileField idPrefix={p} label="Visión" name="vision" defaultValue={profile.vision ?? ""} textarea />
              <BrandProfileField idPrefix={p} label="Valores" name="values" defaultValue={profile.values.join(", ")} />
              <BrandProfileField idPrefix={p} label="Público objetivo" name="targetAudience" defaultValue={profile.targetAudience ?? ""} textarea />
              <BrandProfileField idPrefix={p} label="Tono de comunicación" name="tone" defaultValue={profile.tone ?? ""} />
              <BrandProfileField idPrefix={p} label="Personalidad" name="personality" defaultValue={profile.personality ?? ""} />
              <BrandProfileField idPrefix={p} label="País" name="country" defaultValue={profile.country ?? ""} />
              <BrandProfileField idPrefix={p} label="Estilo de escritura" name="writingStyle" defaultValue={profile.writingStyle ?? ""} />
              <BrandProfileField idPrefix={p} label="Palabras permitidas" name="allowedWords" defaultValue={profile.allowedWords.join(", ")} />
              <BrandProfileField idPrefix={p} label="Palabras prohibidas" name="forbiddenWords" defaultValue={profile.forbiddenWords.join(", ")} />
              <BrandProfileField idPrefix={p} label="CTA preferidos" name="preferredCTAs" defaultValue={profile.preferredCTAs.join(", ")} />
              <BrandProfileField idPrefix={p} label="Redes sociales" name="socialLinks" defaultValue={profile.socialLinks.join(", ")} />
              <BrandProfileField idPrefix={p} label="Sitio web" name="website" defaultValue={profile.website ?? ""} />
              <BrandProfileField idPrefix={p} label="Email" name="email" defaultValue={profile.email ?? ""} />
              <BrandProfileField idPrefix={p} label="Colores (hex)" name="colors" defaultValue={profile.colors.join(", ")} />
              <BrandProfileField idPrefix={p} label="Tipografía" name="typography" defaultValue={profile.typography ?? ""} />
              <BrandProfileField idPrefix={p} label="Logo (referencia)" name="logoUrl" defaultValue={profile.logoUrl ?? ""} />
              <BrandProfileField idPrefix={p} label="Notas internas" name="internalNotes" defaultValue={profile.internalNotes ?? ""} textarea className="sm:col-span-2" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Guardar cambios
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode("view")}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Vista previa del contexto IA</summary>
            <div className="border-t p-3">
              <UniversalResultViewer blocks={contextBlocks} />
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap gap-1">
            {mode !== "edit" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")}>
                Editar
              </Button>
            ) : null}
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleDuplicate}>
              Duplicar
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

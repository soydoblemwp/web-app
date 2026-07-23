"use client";

import { useActionState } from "react";
import { updateBrandKitAction, type BrandKitFormState } from "@/server/actions/brand-kit";
import type { BrandKit } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const initialState: BrandKitFormState = {};

export function BrandKitForm({ projectId, brandKit }: { projectId: string; brandKit: BrandKit }) {
  const action = updateBrandKitAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de marca" name="name" defaultValue={brandKit.name ?? ""} />
        <Field label="Eslogan" name="tagline" defaultValue={brandKit.tagline ?? ""} />
        <Field
          label="Descripción"
          name="description"
          defaultValue={brandKit.description ?? ""}
          textarea
          className="sm:col-span-2"
        />
        <Field label="Personalidad" name="personality" defaultValue={brandKit.personality ?? ""} textarea />
        <Field label="Tono" name="tone" defaultValue={brandKit.tone ?? ""} textarea />
        <Field
          label="Propuesta de valor"
          name="valueProposition"
          defaultValue={brandKit.valueProposition ?? ""}
          textarea
          className="sm:col-span-2"
        />
        <Field label="CTA habituales" name="commonCTAs" defaultValue={brandKit.commonCTAs ?? ""} />
        <Field label="Enlaces principales" name="primaryLinks" defaultValue={brandKit.primaryLinks ?? ""} />
        <Field
          label="Colores (separados por coma)"
          name="colors"
          defaultValue={brandKit.colors.join(", ")}
          placeholder="#111827, #F97316"
        />
        <Field label="Fuentes de referencia" name="fontReferences" defaultValue={brandKit.fontReferences ?? ""} />
        <Field
          label="Competidores"
          name="competitors"
          defaultValue={brandKit.competitors ?? ""}
          className="sm:col-span-2"
        />
        <Field
          label="Instrucciones adicionales"
          name="additionalNotes"
          defaultValue={brandKit.additionalNotes ?? ""}
          textarea
          className="sm:col-span-2"
        />
        <Field
          label="Ejemplos de contenido aprobado"
          name="approvedExamples"
          defaultValue={brandKit.approvedExamples ?? ""}
          textarea
          className="sm:col-span-2"
        />
      </div>

      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Switch id="isActiveForAI" name="isActiveForAI" defaultChecked={brandKit.isActiveForAI} />
        <Label htmlFor="isActiveForAI" className="flex-1">
          Usar este kit de marca en las generaciones de IA
        </Label>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">Kit de marca guardado.</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar kit de marca"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  textarea,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  defaultValue: string;
  textarea?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {textarea ? (
        <Textarea id={name} name={name} defaultValue={defaultValue} rows={3} placeholder={placeholder} />
      ) : (
        <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
      )}
    </div>
  );
}

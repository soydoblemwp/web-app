"use client";

import { useActionState } from "react";
import { generateContentAction, type GenerateContentFormState } from "@/server/actions/content";
import { contentTypeValues } from "@/lib/validation/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: GenerateContentFormState = {};

const TYPE_LABELS: Record<string, string> = {
  ARTICLE: "Artículo",
  BLOG_POST: "Entrada de blog",
  PRODUCT_DESCRIPTION: "Descripción de producto",
  EMAIL: "Correo electrónico",
  NEWSLETTER: "Boletín",
  VIDEO_SCRIPT: "Guion de video",
  AD: "Anuncio",
  LANDING_PAGE: "Página de venta",
  SERVICE_DESCRIPTION: "Descripción de servicio",
  FAQ: "Preguntas frecuentes",
  CALL_TO_ACTION: "Llamado a la acción",
  SOCIAL_TEXT: "Texto para redes sociales",
  TITLE: "Título",
  INTRO: "Introducción",
  CONCLUSION: "Conclusión",
  SUMMARY: "Resumen",
  OTHER: "Otro",
};

export function GenerateContentForm({ projectId }: { projectId: string }) {
  const [state, formAction, isPending] = useActionState(generateContentAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type">Tipo de contenido</Label>
          <Select name="type" defaultValue="BLOG_POST">
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contentTypeValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="language">Idioma</Label>
          <Input id="language" name="language" defaultValue="es" maxLength={10} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="topic">Tema</Label>
          <Textarea id="topic" name="topic" required rows={2} maxLength={2000} placeholder="Sobre qué debe tratar el contenido" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="objective">Objetivo</Label>
          <Input id="objective" name="objective" maxLength={500} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audience">Audiencia</Label>
          <Input id="audience" name="audience" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">Tono</Label>
          <Input id="tone" name="tone" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta">Llamado a la acción</Label>
          <Input id="cta" name="cta" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="keywords">Palabras clave (separadas por coma)</Label>
          <Input id="keywords" name="keywords" maxLength={500} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="forbiddenWords">Palabras a evitar</Label>
          <Input id="forbiddenWords" name="forbiddenWords" maxLength={500} />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Switch id="useBrandKit" name="useBrandKit" defaultChecked />
        <Label htmlFor="useBrandKit" className="flex-1">
          Aplicar el kit de marca de este proyecto
        </Label>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Generando..." : "Generar con IA"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { analyzeSeo, type SeoAnalysisResult } from "@/lib/seo/analyzer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pass: "text-emerald-600",
  warning: "text-amber-600",
  fail: "text-destructive",
};

export function GuestSeoForm() {
  const [result, setResult] = useState<SeoAnalysisResult | null>(null);

  return (
    <div className="space-y-6">
      <form
        action={(formData) => {
          const title = String(formData.get("title") ?? "");
          const metaDescription = String(formData.get("metaDescription") ?? "");
          const targetKeyword = String(formData.get("targetKeyword") ?? "");
          const contentText = String(formData.get("contentText") ?? "");
          setResult(analyzeSeo({ title, metaDescription, targetKeyword, contentText }));
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Título SEO</Label>
            <Input id="title" name="title" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetKeyword">Palabra clave objetivo</Label>
            <Input id="targetKeyword" name="targetKeyword" maxLength={100} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="metaDescription">Metadescripción</Label>
            <Textarea id="metaDescription" name="metaDescription" rows={2} maxLength={400} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="contentText">Contenido a analizar</Label>
            <Textarea
              id="contentText"
              name="contentText"
              rows={12}
              required
              maxLength={30_000}
              placeholder={'Pega tu contenido aquí. Usa "# " para H1 y "## " para H2 si quieres que se detecten los encabezados.'}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <Button type="submit">Analizar</Button>
      </form>

      {result ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-semibold">{result.score}</span>
            <div className="flex-1">
              <Progress value={result.score} />
              <p className="mt-1 text-xs text-muted-foreground">
                Puntuación calculada con reglas deterministas, en tu navegador. No es una garantía de
                posicionamiento en buscadores.
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className={cn("font-medium", STATUS_STYLES[c.status])}>{c.label}</p>
                  <p className="text-muted-foreground">{c.message}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.points}/{c.maxPoints}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

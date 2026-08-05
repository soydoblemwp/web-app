"use client";

import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Loader2, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { computeSeoScore } from "@/lib/editor/seo-score";
import { countLinks } from "@/lib/editor/link-analysis";
import { analyzeStructure, type EditorJsonNode } from "@/lib/editor/structure-analysis";
import { appConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ContentMetadata } from "@/components/editor/sidebar/types";

type SeoActionId = "seo-title" | "meta-description" | "keyword" | "readability" | "optimize" | "faq" | "snippet";
type SuggestionTarget = "seoTitle" | "seoDescription" | "seoKeyword" | "body-replace" | "body-append";

function buildSeoSystemPrompt(instruction: string, brandContext: string): string {
  return [
    "Eres el asistente SEO de AI Content Hub.",
    instruction,
    "Responde ÚNICAMENTE con el resultado solicitado, sin explicaciones ni comillas.",
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function SeoTab({
  editor,
  title,
  metadata,
  brandContext,
  onMetadataChange,
}: {
  editor: Editor | null;
  title: string;
  metadata: ContentMetadata;
  brandContext: string;
  onMetadataChange: (patch: Partial<ContentMetadata>) => void;
}) {
  const ai = useLocalAI();
  const [runningAction, setRunningAction] = useState<SeoActionId | null>(null);
  const [suggestion, setSuggestion] = useState<{ id: SeoActionId; label: string; target: SuggestionTarget; text: string } | null>(
    null
  );
  const busy = ai.status === "loading" || ai.status === "generating";

  const bodyText = editor?.getText() ?? "";
  const html = editor?.getHTML() ?? "";
  const doc = editor?.getJSON() as EditorJsonNode | undefined;
  const headingTexts = useMemo(() => analyzeStructure(doc ?? {}).headings.map((h) => h.text), [doc]);
  const siteHost = useMemo(() => {
    try {
      return new URL(appConfig.url).host;
    } catch {
      return "";
    }
  }, []);
  const linkCounts = useMemo(() => countLinks(html, siteHost), [html, siteHost]);

  const scoreResult = useMemo(
    () =>
      computeSeoScore({
        seoTitle: metadata.seoTitle || title,
        seoDescription: metadata.seoDescription,
        seoKeyword: metadata.seoKeyword,
        bodyText,
        headingTexts,
        internalLinksCount: linkCounts.internal,
        externalLinksCount: linkCounts.external,
      }),
    [metadata.seoTitle, metadata.seoDescription, metadata.seoKeyword, title, bodyText, headingTexts, linkCounts]
  );

  async function run(id: SeoActionId, label: string, instruction: string, target: SuggestionTarget) {
    setRunningAction(id);
    setSuggestion(null);
    const system = buildSeoSystemPrompt(instruction, brandContext);
    const prompt = [
      title ? `Título: ${title}` : "",
      metadata.seoKeyword ? `Palabra clave objetivo: ${metadata.seoKeyword}` : "",
      "Contenido:",
      bodyText || "(vacío)",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await ai.generate({ system, prompt });
    setRunningAction(null);
    if (!result) return;
    setSuggestion({ id, label, target, text: result.trim() });
  }

  function acceptSuggestion() {
    if (!suggestion || !editor) return;
    switch (suggestion.target) {
      case "seoTitle":
        onMetadataChange({ seoTitle: suggestion.text.slice(0, 200) });
        break;
      case "seoDescription":
        onMetadataChange({ seoDescription: suggestion.text.slice(0, 400) });
        break;
      case "seoKeyword":
        onMetadataChange({ seoKeyword: suggestion.text.slice(0, 200) });
        break;
      case "body-replace":
        editor.chain().focus().setContent(suggestion.text, { emitUpdate: true }).run();
        break;
      case "body-append":
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, suggestion.text).run();
        break;
    }
    setSuggestion(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Puntuación SEO</span>
          <span className={cn("font-semibold", scoreResult.score >= 70 ? "text-emerald-600 dark:text-emerald-400" : scoreResult.score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>
            {scoreResult.score}/100
          </span>
        </div>
        <Progress value={scoreResult.score} />
      </div>

      <ul className="space-y-1">
        {scoreResult.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-1.5 text-xs">
            {check.passed ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={check.passed ? "" : "text-muted-foreground"}>{check.label}</span>
          </li>
        ))}
      </ul>

      {suggestion ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
          <p className="text-xs font-medium text-muted-foreground">{suggestion.label}</p>
          <p className="max-h-32 overflow-y-auto rounded border bg-background p-2 text-xs whitespace-pre-wrap">{suggestion.text}</p>
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setSuggestion(null)}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={acceptSuggestion}>
              Usar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="seo-keyword" className="text-xs">
          Palabra clave objetivo
        </Label>
        <Input
          id="seo-keyword"
          value={metadata.seoKeyword}
          onChange={(e) => onMetadataChange({ seoKeyword: e.target.value })}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-title" className="text-xs">
          Título SEO ({metadata.seoTitle.length} car.)
        </Label>
        <Input id="seo-title" value={metadata.seoTitle} onChange={(e) => onMetadataChange({ seoTitle: e.target.value })} maxLength={200} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-description" className="text-xs">
          Meta descripción ({metadata.seoDescription.length} car.)
        </Label>
        <textarea
          id="seo-description"
          value={metadata.seoDescription}
          onChange={(e) => onMetadataChange({ seoDescription: e.target.value })}
          maxLength={400}
          rows={3}
          className="w-full rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-slug" className="text-xs">
          Slug
        </Label>
        <Input id="seo-slug" value={metadata.slug} onChange={(e) => onMetadataChange({ slug: e.target.value })} maxLength={200} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-intent" className="text-xs">
          Intención de búsqueda
        </Label>
        <Input
          id="seo-intent"
          value={metadata.searchIntent}
          onChange={(e) => onMetadataChange({ searchIntent: e.target.value })}
          placeholder="Informacional, transaccional..."
          maxLength={200}
        />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Densidad palabra clave</dt>
          <dd className="font-medium">{scoreResult.keywordDensityPercent.toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Legibilidad</dt>
          <dd className="font-medium">{scoreResult.readability}/100</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Enlaces internos</dt>
          <dd className="font-medium">{linkCounts.internal}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Enlaces externos</dt>
          <dd className="font-medium">{linkCounts.external}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Acciones con IA (sugerencias — nunca se aplican solas)</p>
        <div className="grid grid-cols-2 gap-1.5">
          <SeoActionButton
            label="Título SEO"
            busy={runningAction === "seo-title"}
            disabled={busy}
            onClick={() => run("seo-title", "Título SEO sugerido", "Genera un título SEO de 30 a 60 caracteres para este contenido.", "seoTitle")}
          />
          <SeoActionButton
            label="Meta descripción"
            busy={runningAction === "meta-description"}
            disabled={busy}
            onClick={() =>
              run("meta-description", "Meta descripción sugerida", "Genera una meta descripción de 70 a 160 caracteres para este contenido.", "seoDescription")
            }
          />
          <SeoActionButton
            label="Sugerir palabra clave"
            busy={runningAction === "keyword"}
            disabled={busy}
            onClick={() =>
              run("keyword", "Palabra clave sugerida", "Sugiere UNA sola palabra clave objetivo (2-4 palabras) para este contenido.", "seoKeyword")
            }
          />
          <SeoActionButton
            label="Mejorar legibilidad"
            busy={runningAction === "readability"}
            disabled={busy}
            onClick={() =>
              run(
                "readability",
                "Contenido con legibilidad mejorada",
                "Reescribe el contenido completo con frases y párrafos más cortos para mejorar la legibilidad, sin perder información. Devuelve HTML con <p>/<h2>/<h3>.",
                "body-replace"
              )
            }
          />
          <SeoActionButton
            label="Optimizar contenido"
            busy={runningAction === "optimize"}
            disabled={busy}
            onClick={() =>
              run(
                "optimize",
                "Contenido optimizado para SEO",
                `Reescribe el contenido completo optimizándolo para la palabra clave "${metadata.seoKeyword || "(sin definir)"}", con uso natural en título, encabezados e introducción. Devuelve HTML con <p>/<h2>/<h3>.`,
                "body-replace"
              )
            }
          />
          <SeoActionButton
            label="Generar FAQ"
            busy={runningAction === "faq"}
            disabled={busy}
            onClick={() =>
              run(
                "faq",
                "Sección de preguntas frecuentes",
                "Genera una sección de 3 a 5 preguntas frecuentes (FAQ) relacionadas con este contenido, en HTML con <h3> por pregunta y <p> por respuesta.",
                "body-append"
              )
            }
          />
          <SeoActionButton
            label="Snippet destacado"
            busy={runningAction === "snippet"}
            disabled={busy}
            onClick={() =>
              run(
                "snippet",
                "Snippet destacado sugerido",
                "Escribe un párrafo de 40-60 palabras que responda directamente la intención de búsqueda principal, optimizado para aparecer como snippet destacado en Google.",
                "body-append"
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

function SeoActionButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-auto justify-start py-1.5 text-xs" disabled={disabled} onClick={onClick}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {label}
    </Button>
  );
}

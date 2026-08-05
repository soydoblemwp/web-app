"use client";

import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { analyzeStructure, type EditorJsonNode } from "@/lib/editor/structure-analysis";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StructureAction = "generate" | "improve" | "intro" | "conclusion" | "cta" | "reorganize";

function buildSystemPrompt(instruction: string, brandContext: string): string {
  return [
    "Eres el asistente de estructura de contenido de AI Content Hub.",
    instruction,
    "Responde ÚNICAMENTE con HTML válido (usa <h2>, <h3>, <p>, <ul>, <li> según corresponda), sin explicaciones ni bloques de código markdown.",
    brandContext ? `Contexto de marca a respetar:\n${brandContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function StructureTab({
  editor,
  title,
  objective,
  brandContext,
}: {
  editor: Editor | null;
  title: string;
  objective: string;
  brandContext: string;
}) {
  const ai = useLocalAI();
  const [runningAction, setRunningAction] = useState<StructureAction | null>(null);
  const [preview, setPreview] = useState<{ action: StructureAction; html: string } | null>(null);

  const doc = editor?.getJSON() as EditorJsonNode | undefined;
  const analysis = useMemo(() => analyzeStructure(doc ?? {}), [doc]);
  const busy = ai.status === "loading" || ai.status === "generating";

  function scrollToHeading(index: number) {
    if (!editor) return;
    const headingEls = editor.view.dom.querySelectorAll("h1, h2, h3");
    const target = headingEls[index];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function run(action: StructureAction, instruction: string, insertion: "start" | "end" | "replace") {
    if (!editor) return;
    setRunningAction(action);
    setPreview(null);

    const bodyText = editor.getText();
    const system = buildSystemPrompt(instruction, brandContext);
    const prompt = [
      title ? `Título: ${title}` : "",
      objective ? `Objetivo: ${objective}` : "",
      "Contenido actual:",
      bodyText || "(vacío)",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await ai.generate({ system, prompt });
    setRunningAction(null);
    if (!result) return;

    if (insertion === "replace") {
      setPreview({ action, html: result.trim() });
      return;
    }

    if (insertion === "start") {
      editor.chain().focus().insertContentAt(0, result.trim()).run();
    } else {
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, result.trim()).run();
    }
  }

  function acceptPreview() {
    if (!editor || !preview) return;
    editor.chain().focus().setContent(preview.html, { emitUpdate: true }).run();
    setPreview(null);
  }

  return (
    <div className="space-y-4">
      {preview ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa — reemplazará todo el contenido</p>
          <div
            className="max-h-48 overflow-y-auto rounded border bg-background p-2 text-xs"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={acceptPreview}>
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Jerarquía</p>
        {analysis.headings.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no hay encabezados en el documento.</p>
        ) : (
          <ul className="space-y-0.5">
            {analysis.headings.map((heading, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => scrollToHeading(heading.index)}
                  className={cn(
                    "w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted",
                    heading.level === 1 && "font-semibold",
                    heading.level === 2 && "pl-3",
                    heading.level >= 3 && "pl-5 text-muted-foreground"
                  )}
                  title={heading.text}
                >
                  {heading.text || "(encabezado vacío)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Diagnóstico</p>
        {analysis.issues.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" /> Sin problemas detectados.
          </p>
        ) : (
          <ul className="space-y-1">
            {analysis.issues.map((issue) => (
              <li key={issue.id} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Acciones con IA</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            label="Generar estructura"
            busy={runningAction === "generate"}
            disabled={busy}
            onClick={() =>
              run(
                "generate",
                "Genera un esbozo de estructura (encabezados H2 y una frase guía por sección) para el tema indicado.",
                "end"
              )
            }
          />
          <ActionButton
            label="Mejorar estructura"
            busy={runningAction === "improve"}
            disabled={busy}
            onClick={() =>
              run(
                "improve",
                "Reorganiza y mejora la estructura del contenido completo (encabezados, párrafos) sin perder información, devolviendo el documento completo reescrito.",
                "replace"
              )
            }
          />
          <ActionButton
            label="Añadir introducción"
            busy={runningAction === "intro"}
            disabled={busy}
            onClick={() => run("intro", "Escribe únicamente un párrafo de introducción para este contenido.", "start")}
          />
          <ActionButton
            label="Añadir conclusión"
            busy={runningAction === "conclusion"}
            disabled={busy}
            onClick={() => run("conclusion", "Escribe únicamente un párrafo de conclusión para este contenido.", "end")}
          />
          <ActionButton
            label="Añadir CTA"
            busy={runningAction === "cta"}
            disabled={busy}
            onClick={() => run("cta", "Escribe únicamente una llamada a la acción (CTA) breve para cerrar este contenido.", "end")}
          />
          <ActionButton
            label="Reorganizar secciones"
            busy={runningAction === "reorganize"}
            disabled={busy}
            onClick={() =>
              run(
                "reorganize",
                "Reordena las secciones existentes en el orden más lógico posible, sin añadir ni quitar información, devolviendo el documento completo.",
                "replace"
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-auto justify-start py-1.5 text-xs" disabled={disabled} onClick={onClick}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {label}
    </Button>
  );
}

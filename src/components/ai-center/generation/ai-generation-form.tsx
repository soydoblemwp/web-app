"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { saveAiToolResultAction } from "@/server/actions/ai-center-tools";
import type { AiToolDefinition, AiToolFieldValues } from "@/lib/ai-center/tools/types";
import { dedupeLines } from "@/lib/ai-center/tools/format";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { WorkspaceResultActions } from "@/components/workspace/workspace-result-actions";
import { ResultEditForm } from "@/components/workspace/result-edit-form";
import { SavePromptButton } from "@/components/prompt-library/save-prompt-button";
import { SaveAsTemplateButton } from "@/components/ai-templates/save-as-template-button";
import { BrandProfileSelect } from "@/components/brand-profiles/brand-profile-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Generic engine for every AI Center tool: renders `tool.fields`, validates
 * required/number fields, runs the local browser model, then persists via
 * the shared save-only action. Platform-agnostic — a YouTube tool and a
 * future Instagram/TikTok tool are both just an AiToolDefinition passed in.
 *
 * The generated result is rendered through the same UniversalResultViewer
 * and WorkspaceResultActions the Workspace history uses — one visual/action
 * system for a result, whether it's seen right after generation or later
 * from the Workspace.
 */
export function AiGenerationForm({
  tool,
  projectId,
  brandContextText,
}: {
  tool: AiToolDefinition;
  projectId: string;
  brandContextText: string;
}) {
  const ai = useLocalAI();
  const [result, setResult] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [brandProfileContext, setBrandProfileContext] = useState("");
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = ai.status === "loading" || ai.status === "generating" || saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const values: AiToolFieldValues = {};

    for (const field of tool.fields) {
      const raw = String(formData.get(field.name) ?? "").trim();

      if (field.required && !raw) {
        setFormError(`Completa el campo "${field.label}".`);
        return;
      }

      if (field.type === "number" && raw) {
        const numeric = Number(raw);
        const belowMin = field.min !== undefined && numeric < field.min;
        const aboveMax = field.max !== undefined && numeric > field.max;
        if (!Number.isFinite(numeric) || belowMin || aboveMax) {
          setFormError(`"${field.label}" debe ser un número entre ${field.min} y ${field.max}.`);
          return;
        }
      }

      values[field.name] = raw;
    }

    const system = tool.buildSystemPrompt([brandContextText, brandProfileContext].filter(Boolean).join("\n\n"));
    const prompt = tool.buildUserPrompt(values);

    const text = await ai.generate({ system, prompt });
    if (!text) return;

    const title = tool.buildItemTitle(values);
    setResult(text);
    setResultTitle(title);
    setLastPrompt(prompt);
    setContentItemId(null);
    setIsEditing(false);

    setSaving(true);
    const saveResult = await saveAiToolResultAction({
      projectId,
      toolSlug: tool.slug,
      title,
      body: text,
      language: values.idioma || "es",
    });
    setSaving(false);
    if (saveResult?.error) setFormError(saveResult.error);
    if (saveResult?.contentItemId) setContentItemId(saveResult.contentItemId);
  }

  const blocks = useMemo(() => {
    if (!result) return [];
    return parseResultBlocks(result).map((block) =>
      block.kind === "list" ? { ...block, items: dedupeLines(block.items) } : block
    );
  }, [result]);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <BrandProfileSelect projectId={projectId} onContextChange={setBrandProfileContext} />
        <div className="grid gap-4 sm:grid-cols-2">
          {tool.fields.map((field) => (
            <div key={field.name} className={field.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <Label htmlFor={field.name}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  maxLength={field.maxLength}
                  defaultValue={field.defaultValue as string | undefined}
                  placeholder={field.placeholder}
                  rows={3}
                />
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type === "number" ? "number" : "text"}
                  required={field.required}
                  maxLength={field.maxLength}
                  min={field.min}
                  max={field.max}
                  defaultValue={field.defaultValue}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <LocalAIStatusPanel ai={ai} />
        <Button type="submit" disabled={busy}>
          {saving ? "Guardando..." : busy ? "Generando..." : "Generar"}
        </Button>
        <p className="text-xs text-muted-foreground">
          El resultado se guarda en la biblioteca de contenido del proyecto.
        </p>
      </form>

      {result ? (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          {isEditing && contentItemId ? (
            <ResultEditForm
              projectId={projectId}
              contentItemId={contentItemId}
              title={resultTitle ?? tool.label}
              body={result}
              onSaved={({ title, body }) => {
                setResultTitle(title);
                setResult(body);
                setIsEditing(false);
              }}
            />
          ) : (
            <UniversalResultViewer blocks={blocks} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <WorkspaceResultActions
              result={{
                id: contentItemId,
                title: resultTitle ?? tool.label,
                body: result,
                sourceTool: tool.slug,
                toolLabel: tool.label,
                isFavorite: false,
              }}
              projectId={projectId}
              showFavorite
              showOpenInWorkspace
              showRegenerate={false}
            />
            {lastPrompt ? (
              <SavePromptButton projectId={projectId} toolSlug={tool.slug} defaultTitle={tool.label} content={lastPrompt} />
            ) : null}
            <SaveAsTemplateButton projectId={projectId} toolSlug={tool.slug} defaultTitle={tool.label} generatedContent={result} />
            {contentItemId ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing((prev) => !prev)}>
                <Pencil className="size-3.5" /> {isEditing ? "Cancelar edición" : "Editar manualmente"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

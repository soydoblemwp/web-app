"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { REPURPOSE_CHANNELS, type RepurposeChannelId } from "@/lib/editor/repurpose-platforms";
import { toEditorHtml } from "@/lib/editor/serialization";
import { createRepurposedContentAction } from "@/server/actions/content";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RepurposeTab({
  projectId,
  contentId,
  editor,
  brandContext,
  brandProfileId,
}: {
  projectId: string;
  contentId: string;
  editor: Editor | null;
  brandContext: string;
  brandProfileId: string | null;
}) {
  const ai = useLocalAI();
  const [activeChannel, setActiveChannel] = useState<RepurposeChannelId | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  const channel = activeChannel ? REPURPOSE_CHANNELS.find((c) => c.id === activeChannel) : null;

  async function generate(id: RepurposeChannelId) {
    if (!editor) return;
    const def = REPURPOSE_CHANNELS.find((c) => c.id === id);
    if (!def) return;

    setActiveChannel(id);
    setDraftHtml("");
    setSavedId(null);

    const originalText = editor.getText();
    if (!originalText.trim()) {
      toast.error("No hay contenido que reutilizar todavía.");
      setActiveChannel(null);
      return;
    }

    const system = def.buildSystemPrompt(brandContext);
    const prompt = def.buildUserPrompt(originalText);
    const result = await ai.generate({ system, prompt });
    if (!result) return;

    setDraftHtml(toEditorHtml(result.trim()));
  }

  async function save() {
    if (!channel || !draftHtml.trim()) return;
    setSaving(true);
    const result = await createRepurposedContentAction({
      projectId,
      sourceContentId: contentId,
      channel: channel.id,
      type: channel.contentType,
      title: `${channel.label}: reutilizado`,
      body: draftHtml,
      brandProfileId,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSavedId(result.id ?? null);
    toast.success(`Versión para ${channel.label} guardada.`);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Genera una versión del contenido actual adaptada a otro canal. Siempre queda vinculada al contenido original.
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {REPURPOSE_CHANNELS.map((c) => (
          <Button
            key={c.id}
            type="button"
            variant={activeChannel === c.id ? "secondary" : "outline"}
            size="sm"
            className="h-auto justify-start py-1.5 text-xs"
            disabled={busy}
            onClick={() => generate(c.id)}
          >
            {busy && activeChannel === c.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {c.label}
          </Button>
        ))}
      </div>

      {activeChannel && (draftHtml || busy) ? (
        <div className="space-y-2 rounded-lg border p-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa — {channel?.label}</p>
          {busy && !draftHtml ? (
            <p className="text-xs text-muted-foreground">Generando...</p>
          ) : (
            <>
              <RichEditor content={draftHtml} onChangeHtml={setDraftHtml} placeholder="Edita antes de guardar..." />
              <div className={cn("flex items-center justify-between gap-2")}>
                {savedId ? (
                  <Link
                    href={`/dashboard/${projectId}/content/${savedId}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Ver contenido guardado <ExternalLink className="size-3" />
                  </Link>
                ) : (
                  <span />
                )}
                <Button type="button" size="sm" onClick={save} disabled={saving || !draftHtml.trim()}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

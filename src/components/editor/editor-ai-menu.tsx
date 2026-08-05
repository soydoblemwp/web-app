"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Sparkles, Check, X, Languages, Palette, BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import type { UseLocalAIResult } from "@/hooks/use-local-ai";
import type { EditorAiAction } from "@/lib/editor/ai-actions";
import type { SavedPromptLike } from "@/lib/prompt-library/types";

export interface EditorAiPreview {
  actionId: string;
  actionLabel: string;
  from: number;
  to: number;
  result: string;
}

const TONE_ACTION_IDS = new Set(["tone-professional", "tone-friendly"]);
const TRANSLATE_PREFIX = "translate-";

export function EditorAiMenu({
  editor,
  actions,
  ai,
  busyActionId,
  preview,
  onRunAction,
  onAccept,
  onDiscard,
  savedPrompts,
  onRunSavedPrompt,
}: {
  editor: Editor | null;
  actions: EditorAiAction[];
  ai: UseLocalAIResult;
  busyActionId: string | null;
  preview: EditorAiPreview | null;
  onRunAction: (actionId: string) => void;
  onAccept: () => void;
  onDiscard: () => void;
  savedPrompts: SavedPromptLike[];
  onRunSavedPrompt: (prompt: SavedPromptLike) => void;
}) {
  if (!editor) return null;

  const toneActions = actions.filter((a) => TONE_ACTION_IDS.has(a.id));
  const translateActions = actions.filter((a) => a.id.startsWith(TRANSLATE_PREFIX));
  const directActions = actions.filter((a) => !TONE_ACTION_IDS.has(a.id) && !a.id.startsWith(TRANSLATE_PREFIX));
  const busy = ai.status === "loading" || ai.status === "generating";

  return (
    <BubbleMenu editor={editor} shouldShow={({ from, to, editor: ed }) => ed.isEditable && from !== to}>
      <div className="flex max-w-sm flex-col gap-2 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md">
        {preview ? (
          <div className="max-w-xs space-y-2 p-1.5">
            <p className="text-xs font-medium text-muted-foreground">{preview.actionLabel}</p>
            <p className="max-h-40 overflow-y-auto rounded border bg-muted/40 p-2 text-sm whitespace-pre-wrap">{preview.result}</p>
            <div className="flex justify-end gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={onDiscard}>
                <X className="size-3.5" /> Descartar
              </Button>
              <Button type="button" size="sm" onClick={onAccept}>
                <Check className="size-3.5" /> Insertar
              </Button>
            </div>
          </div>
        ) : busy ? (
          <div className="w-64 p-1.5">
            <LocalAIStatusPanel ai={ai} />
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" size="sm" variant="ghost" className="gap-1.5 text-primary" />}>
              <Sparkles className="size-4" /> IA
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {directActions
                .filter((a) => a.id !== "seo" && a.id !== "cta" && a.id !== "hashtags")
                .map((action) => (
                  <DropdownMenuItem key={action.id} disabled={busyActionId === action.id} onClick={() => onRunAction(action.id)}>
                    {action.label}
                  </DropdownMenuItem>
                ))}

              {toneActions.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="size-4" /> Cambiar tono
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {toneActions.map((action) => (
                      <DropdownMenuItem key={action.id} onClick={() => onRunAction(action.id)}>
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              {translateActions.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Languages className="size-4" /> Traducir
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {translateActions.map((action) => (
                      <DropdownMenuItem key={action.id} onClick={() => onRunAction(action.id)}>
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              <DropdownMenuSeparator />

              {["seo", "cta", "hashtags"].map((id) => {
                const action = directActions.find((a) => a.id === id);
                if (!action) return null;
                return (
                  <DropdownMenuItem key={action.id} onClick={() => onRunAction(action.id)}>
                    {action.label}
                  </DropdownMenuItem>
                );
              })}

              {savedPrompts.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <BookText className="size-4" /> Prompt guardado
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {savedPrompts.slice(0, 15).map((prompt) => (
                        <DropdownMenuItem key={prompt.id} onClick={() => onRunSavedPrompt(prompt)}>
                          {prompt.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {ai.status === "error" && !busy ? (
          <div className="w-64 p-1.5">
            <LocalAIStatusPanel ai={ai} />
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
}

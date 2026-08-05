"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { useRichEditor } from "@/components/editor/use-rich-editor";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { RichEditorSurface } from "@/components/editor/rich-editor-surface";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorStatusBar } from "@/components/editor/editor-status-bar";
import { EditorAiMenu, type EditorAiPreview } from "@/components/editor/editor-ai-menu";
import { BrandProfileSelect } from "@/components/brand-profiles/brand-profile-select";
import { EDITOR_AI_ACTIONS, findEditorAiAction } from "@/lib/editor/ai-actions";
import { toEditorHtml } from "@/lib/editor/serialization";
import { listSavedPromptsForSelectAction, recordPromptUseAction } from "@/server/actions/prompt-library";
import type { SavedPromptLike } from "@/lib/prompt-library/types";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { cn } from "@/lib/utils";

export interface RichEditorProps {
  /** Raw stored body — plain text (legacy) or HTML. Converted to a real HTML doc via toEditorHtml on load. */
  content: string;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Composed into every AI action's system prompt (see src/lib/ai/brand-context.ts) — the same context AI Center tools receive. */
  brandContextText?: string;
  /** Enables the Brand Kit selector and the Prompt Library submenu in the AI menu; omit to render a context-free editor. */
  projectId?: string;
  /** When set, the editor autosaves debounced changes through this callback (see src/server/actions/content.ts's autosaveContentItemAction). */
  onAutosave?: (html: string) => Promise<void>;
  /** Fires on every change, independent of autosave — e.g. to keep a hidden form field in sync for an explicit "save version" submit. */
  onChangeHtml?: (html: string) => void;
  /** Fires once the Tiptap instance exists (and again if it's recreated) — lets a parent (e.g. the Command Center sidebar, Fase 27) read live doc state / call editor commands without RichEditor needing to know about that caller at all. */
  onEditorReady?: (editor: Editor | null) => void;
  /** Pre-selects a specific Brand Profile (e.g. one already saved on a ContentItem) instead of defaulting to "Automático". */
  initialBrandProfileId?: string | null;
  /** Fires whenever the selected Brand Profile changes — lets a parent persist WHICH profile was used (see ContentItem.brandProfileId). */
  onBrandProfileChange?: (profile: BrandProfileLike | null) => void;
  /**
   * Controlled fullscreen — when provided (together with onToggleFullscreen),
   * a parent owns the fullscreen state and RichEditor renders inline instead
   * of self-wrapping in a fixed overlay, so the parent can include OTHER
   * elements (like the sidebar) inside its own fullscreen container. Omit
   * both to keep RichEditor's original self-contained fullscreen behavior
   * (e.g. ResultEditForm, which has no sidebar).
   */
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

/**
 * THE official rich text editor for this project (Fase 26). Every surface
 * that edits a ContentItem body should render this component — never a
 * bespoke Textarea or a second editor implementation.
 */
export function RichEditor({
  content,
  editable = true,
  placeholder,
  autoFocus,
  className,
  brandContextText = "",
  projectId,
  onAutosave,
  onChangeHtml,
  onEditorReady,
  initialBrandProfileId,
  onBrandProfileChange,
  fullscreen: controlledFullscreen,
  onToggleFullscreen: controlledToggleFullscreen,
}: RichEditorProps) {
  const fullscreenControlled = controlledFullscreen !== undefined;
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const fullscreen = fullscreenControlled ? controlledFullscreen : internalFullscreen;
  const toggleFullscreen = controlledToggleFullscreen ?? (() => setInternalFullscreen((prev) => !prev));
  const [focusMode, setFocusMode] = useState(false);
  const [brandProfileContext, setBrandProfileContext] = useState("");
  const [savedPrompts, setSavedPrompts] = useState<SavedPromptLike[]>([]);

  const autosave = useEditorAutosave(onAutosave ?? (async () => {}));

  const editor = useRichEditor({
    content: toEditorHtml(content),
    editable,
    placeholder,
    autoFocus,
    onUpdateHtml: (html) => {
      onChangeHtml?.(html);
      if (onAutosave) autosave.notifyChange(html);
    },
  });

  useEffect(() => {
    autosave.markSaved(toEditorHtml(content));
    // Only re-baseline when a genuinely different item is loaded, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listSavedPromptsForSelectAction(projectId).then((prompts) => {
      if (!cancelled) setSavedPrompts(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const ai = useLocalAI();
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EditorAiPreview | null>(null);

  const composedBrandContext = [brandContextText, brandProfileContext].filter(Boolean).join("\n\n");

  async function runAiAction(actionId: string) {
    if (!editor) return;
    const action = findEditorAiAction(actionId);
    if (!action) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (action.requiresSelection && !selectedText.trim()) return;

    setBusyActionId(actionId);
    setPreview(null);

    const system = action.buildSystemPrompt({ brandContext: composedBrandContext });
    const prompt = action.buildUserPrompt(selectedText);
    const text = await ai.generate({ system, prompt });
    setBusyActionId(null);
    if (!text) return;

    setPreview({ actionId, actionLabel: action.label, from, to, result: text.trim() });
  }

  async function runContinueWriting() {
    if (!editor) return;
    const action = findEditorAiAction("continue-writing");
    if (!action) return;

    const cursor = editor.state.selection.to;
    const precedingText = editor.state.doc.textBetween(Math.max(0, cursor - 4000), cursor, "\n");
    if (!precedingText.trim()) return;

    setBusyActionId("continue-writing");
    const system = action.buildSystemPrompt({ brandContext: composedBrandContext });
    const prompt = action.buildUserPrompt(precedingText);
    const text = await ai.generate({ system, prompt });
    setBusyActionId(null);
    if (!text) return;

    editor.chain().focus().insertContentAt(cursor, text.trim().startsWith(" ") ? text : ` ${text.trim()}`).run();
  }

  async function runSavedPrompt(savedPrompt: SavedPromptLike) {
    if (!editor || !projectId) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;

    setBusyActionId(`prompt-${savedPrompt.id}`);
    setPreview(null);
    const system = [
      savedPrompt.content,
      "Responde ÚNICAMENTE con el texto resultante, sin explicaciones ni comillas.",
      savedPrompt.useBrandKit && composedBrandContext ? `Contexto de marca a respetar:\n${composedBrandContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const text = await ai.generate({ system, prompt: selectedText });
    setBusyActionId(null);
    if (!text) return;

    setPreview({ actionId: `prompt-${savedPrompt.id}`, actionLabel: savedPrompt.title, from, to, result: text.trim() });
    void recordPromptUseAction(projectId, savedPrompt.id);
  }

  function acceptPreview() {
    if (!editor || !preview) return;
    editor.chain().focus().insertContentAt({ from: preview.from, to: preview.to }, preview.result).run();
    setPreview(null);
  }

  const autosaveStatus: AutosaveStatus | undefined = onAutosave ? autosave.status : undefined;

  return (
    <div
      className={cn(
        "space-y-2",
        !fullscreenControlled && fullscreen && "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4",
        className
      )}
    >
      {projectId ? (
        <BrandProfileSelect
          projectId={projectId}
          onContextChange={setBrandProfileContext}
          onProfileChange={onBrandProfileChange}
          initialProfileId={initialBrandProfileId}
        />
      ) : null}

      <div className={cn(!fullscreenControlled && fullscreen && "mx-auto flex w-full max-w-3xl flex-1 flex-col")}>
        <EditorToolbar
          editor={editor}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onContinueWriting={runContinueWriting}
          continueWritingBusy={busyActionId === "continue-writing"}
        />
        <div className="relative border px-3 py-2">
          <RichEditorSurface editor={editor} focusMode={focusMode} />
          <EditorAiMenu
            editor={editor}
            actions={EDITOR_AI_ACTIONS.filter((a) => a.requiresSelection)}
            ai={ai}
            busyActionId={busyActionId}
            preview={preview}
            onRunAction={runAiAction}
            onAccept={acceptPreview}
            onDiscard={() => setPreview(null)}
            savedPrompts={savedPrompts}
            onRunSavedPrompt={runSavedPrompt}
          />
        </div>
        <EditorStatusBar editor={editor} autosaveStatus={autosaveStatus} />
      </div>
    </div>
  );
}

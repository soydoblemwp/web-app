"use client";

import type { Editor } from "@tiptap/react";
import { estimateReadingTimeMinutes } from "@/lib/editor/reading-time";
import type { AutosaveStatus } from "@/components/editor/use-editor-autosave";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Editando...",
  saving: "Guardando...",
  saved: "Guardado",
  error: "No se pudo guardar",
};

export function EditorStatusBar({ editor, autosaveStatus }: { editor: Editor | null; autosaveStatus?: AutosaveStatus }) {
  if (!editor) return null;

  const words = editor.storage.characterCount?.words() ?? 0;
  const characters = editor.storage.characterCount?.characters() ?? 0;
  const readingTime = estimateReadingTimeMinutes(words);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-lg border border-t-0 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span>{words} palabras</span>
        <span>{characters} caracteres</span>
        <span>{readingTime} min de lectura</span>
      </div>
      {autosaveStatus ? (
        <span className={autosaveStatus === "error" ? "text-destructive" : undefined}>{AUTOSAVE_LABEL[autosaveStatus]}</span>
      ) : null}
    </div>
  );
}

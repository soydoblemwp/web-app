"use client";

import { useEditor, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { buildEditorExtensions } from "@/lib/editor/extensions";

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function insertImageFilesAt(view: EditorView, pos: number, files: File[]) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    void readImageAsDataUrl(file).then((src) => {
      const imageType = view.state.schema.nodes.image;
      if (!imageType) return;
      const node = imageType.create({ src, alt: file.name });
      view.dispatch(view.state.tr.insert(pos, node));
    });
  }
}

export interface UseRichEditorOptions {
  content: string;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onUpdateHtml?: (html: string, editor: Editor) => void;
}

/**
 * The one place that constructs a Tiptap editor instance for this app. Every
 * surface that embeds the rich editor (content detail, Workspace result
 * editing, future callers) goes through this hook so they share the exact
 * same schema/extensions (see src/lib/editor/extensions.ts) — never a
 * second, slightly-different editor configuration.
 */
export function useRichEditor({ content, editable = true, placeholder, autoFocus, onUpdateHtml }: UseRichEditorOptions) {
  return useEditor({
    content,
    editable,
    autofocus: autoFocus ? "end" : false,
    // Required for Next.js SSR: rendering the initial doc only on the client
    // avoids a server/client markup mismatch (see @tiptap/react's own docs
    // on immediatelyRender).
    immediatelyRender: false,
    extensions: buildEditorExtensions({ placeholder }),
    onUpdate: ({ editor }) => {
      onUpdateHtml?.(editor.getHTML(), editor);
    },
    editorProps: {
      // Drag-and-drop / paste image upload: no storage provider exists in
      // this project (STORAGE_PROVIDER is unconfigured, see .env.example),
      // so dropped/pasted image files are embedded as base64 data URLs —
      // works everywhere with zero backend dependency. Operates directly on
      // the ProseMirror view (not the Tiptap Editor wrapper, which doesn't
      // exist yet while these props are being constructed).
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImageFilesAt(view, coords?.pos ?? view.state.selection.from, files);
        return true;
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        insertImageFilesAt(view, view.state.selection.from, files);
        return true;
      },
    },
  });
}

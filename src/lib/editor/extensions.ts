import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder, CharacterCount, Focus } from "@tiptap/extensions";
import type { AnyExtension } from "@tiptap/core";

/** Class the Focus extension applies to the block containing the cursor — used by editor.css to dim everything else in "modo enfoque". */
export const EDITOR_FOCUSED_BLOCK_CLASS = "editor-focused-block";

/**
 * The single extension set for the editor — every surface that embeds
 * RichEditor (content detail, Workspace result editing, and any future
 * caller) gets the exact same document schema, so bodies stay portable
 * between them instead of each screen inventing its own subset.
 */
export function buildEditorExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
    }),
    TableKit.configure({
      table: { resizable: true },
    }),
    Image.configure({
      allowBase64: true,
      resize: { enabled: true },
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Empieza a escribir...",
    }),
    CharacterCount.configure({}),
    Focus.configure({ className: EDITOR_FOCUSED_BLOCK_CLASS, mode: "deepest" }),
  ];
}

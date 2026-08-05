"use client";

import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/components/editor/editor.css";

export function RichEditorSurface({
  editor,
  focusMode = false,
  className,
}: {
  editor: Editor | null;
  focusMode?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("rich-editor-content", className)}
      data-focus-mode={focusMode ? "true" : "false"}
      onClick={() => editor?.chain().focus().run()}
    >
      <EditorContent editor={editor} />
      {editor ? (
        <DragHandle editor={editor} nested>
          <div className="rich-editor-drag-handle">
            <GripVertical className="size-4" />
          </div>
        </DragHandle>
      ) : null}
    </div>
  );
}

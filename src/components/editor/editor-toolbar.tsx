"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Focus,
  ChevronDown,
  Wand2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "text-foreground")}
    >
      {children}
    </Button>
  );
}

export function EditorToolbar({
  editor,
  fullscreen,
  onToggleFullscreen,
  focusMode,
  onToggleFocusMode,
  onContinueWriting,
  continueWritingBusy,
}: {
  editor: Editor | null;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  /** "Continuar escribiendo" (src/lib/editor/ai-actions.ts) — the one AI action that acts on the cursor position rather than a selection, so it lives in the toolbar rather than the selection-only floating AI menu. */
  onContinueWriting?: () => void;
  continueWritingBusy?: boolean;
}) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  if (!editor) return null;

  function openLinkDialog() {
    setLinkUrl(editor!.getAttributes("link").href ?? "");
    setLinkDialogOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (!url) {
      editor!.chain().focus().unsetLink().run();
    } else {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkDialogOpen(false);
  }

  function applyImage() {
    const url = imageUrl.trim();
    if (url) editor!.chain().focus().setImage({ src: url }).run();
    setImageUrl("");
    setImageDialogOpen(false);
  }

  const headingLabel = editor.isActive("heading", { level: 1 })
    ? "Título 1"
    : editor.isActive("heading", { level: 2 })
      ? "Título 2"
      : editor.isActive("heading", { level: 3 })
        ? "Título 3"
        : "Párrafo";

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 bg-muted/30 p-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="gap-1" />}>
          {headingLabel} <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow className="size-4" /> Párrafo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="size-4" /> Título 1
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" /> Título 2
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="size-4" /> Título 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton label="Negrita" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Cursiva" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Subrayado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton label="Lista de viñetas" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Cita" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Bloque de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton label="Enlace" active={editor.isActive("link")} onClick={openLinkDialog}>
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Imagen" onClick={() => setImageDialogOpen(true)}>
        <ImageIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Tabla"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton label="Deshacer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Rehacer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton label="Modo enfoque" active={focusMode} onClick={onToggleFocusMode}>
        <Focus className="size-4" />
      </ToolbarButton>
      <ToolbarButton label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} active={fullscreen} onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </ToolbarButton>

      {onContinueWriting ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-primary"
            disabled={continueWritingBusy}
            onClick={onContinueWriting}
            title="Continuar escribiendo con IA"
          >
            {continueWritingBusy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Continuar escribiendo
          </Button>
        </>
      ) : null}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enlace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="editor-link-url">URL</Label>
            <Input
              id="editor-link-url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && applyLink()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={applyLink}>
              {linkUrl.trim() ? "Aplicar" : "Quitar enlace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Insertar imagen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="editor-image-url">URL de la imagen</Label>
            <Input
              id="editor-image-url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && applyImage()}
            />
            <p className="text-xs text-muted-foreground">
              También puedes arrastrar y soltar un archivo de imagen directamente sobre el editor.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImageDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={applyImage}>
              Insertar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

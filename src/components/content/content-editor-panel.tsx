"use client";

import { useRef, useState } from "react";
import { History } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { RichEditor } from "@/components/editor/rich-editor";
import { EditorSidebar } from "@/components/editor/sidebar/editor-sidebar";
import { useEditorAutosave, type AutosaveStatus } from "@/components/editor/use-editor-autosave";
import { autosaveContentItemAction, updateContentItemAction, updateContentMetadataAction } from "@/server/actions/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ContentMetadata, VersionSummary } from "@/components/editor/sidebar/types";
import { cn } from "@/lib/utils";

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Cambios pendientes",
  saving: "Guardando...",
  saved: "Guardado automáticamente",
  error: "No se pudo guardar automáticamente",
};

/**
 * The content detail page's editing surface — title field + the official
 * RichEditor (Fase 26) + the AI Content Command Center sidebar (Fase 27),
 * bound to a single ContentItem. Autosaves continuously (autosaveContentItemAction
 * for title/body, updateContentMetadataAction for the sidebar's metadata —
 * no version snapshot either way) and offers an explicit "Guardar versión"
 * checkpoint (updateContentItemAction — the same action/transaction that
 * already powers ResultEditForm's manual save).
 */
export function ContentEditorPanel({
  projectId,
  contentId,
  initialTitle,
  initialBody,
  brandContextText,
  authorName,
  updatedAt,
  initialMetadata,
  publishChecklistRaw,
  versions,
}: {
  projectId: string;
  contentId: string;
  initialTitle: string;
  initialBody: string;
  brandContextText: string;
  authorName: string;
  updatedAt: string;
  initialMetadata: ContentMetadata;
  publishChecklistRaw: unknown;
  versions: VersionSummary[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [metadata, setMetadata] = useState<ContentMetadata>(initialMetadata);
  const [fullscreen, setFullscreen] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  // Bumped after a version restore so RichEditor remounts with the restored
  // body — Tiptap only ever reads `content` as the INITIAL document, so
  // changing the prop alone would not update an already-mounted editor.
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [displayedBody, setDisplayedBody] = useState(initialBody);

  const titleRef = useRef(initialTitle);
  const bodyRef = useRef(initialBody);
  const metadataRef = useRef(initialMetadata);

  const autosave = useEditorAutosave(async () => {
    const result = await autosaveContentItemAction(projectId, {
      id: contentId,
      title: titleRef.current,
      body: bodyRef.current,
    });
    if (result.error) throw new Error(result.error);
  });

  const metadataAutosave = useEditorAutosave(async () => {
    const result = await updateContentMetadataAction(projectId, { id: contentId, ...metadataRef.current });
    if (result.error) throw new Error(result.error);
  });

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setTitle(value);
    titleRef.current = value;
    autosave.notifyChange(`title:${value}`);
  }

  function handleBodyChange(html: string) {
    bodyRef.current = html;
    setDisplayedBody(html);
    autosave.notifyChange(`body:${html}`);
  }

  function handleMetadataChange(patch: Partial<ContentMetadata>) {
    setMetadata((prev) => {
      const next = { ...prev, ...patch };
      metadataRef.current = next;
      return next;
    });
    metadataAutosave.notifyChange(`metadata:${JSON.stringify({ ...metadataRef.current, ...patch })}`);
  }

  async function handleSaveVersion() {
    setSavingVersion(true);
    setVersionSaved(false);
    const formData = new FormData();
    formData.set("id", contentId);
    formData.set("title", titleRef.current);
    formData.set("body", bodyRef.current);
    if (versionNote.trim()) formData.set("note", versionNote.trim());
    await updateContentItemAction(projectId, formData);
    setSavingVersion(false);
    setVersionSaved(true);
    setVersionNote("");
    setNoteDialogOpen(false);
  }

  function handleRestored(restoredTitle: string, restoredBody: string) {
    setTitle(restoredTitle);
    titleRef.current = restoredTitle;
    bodyRef.current = restoredBody;
    setDisplayedBody(restoredBody);
    autosave.markSaved(`body:${restoredBody}`);
    setEditorGeneration((g) => g + 1);
  }

  const combinedAutosaveStatus =
    metadataAutosave.status === "error" || autosave.status === "error"
      ? "error"
      : metadataAutosave.status === "saving" || autosave.status === "saving"
        ? "saving"
        : metadataAutosave.status === "pending" || autosave.status === "pending"
          ? "pending"
          : autosave.status === "saved" || metadataAutosave.status === "saved"
            ? "saved"
            : "idle";

  return (
    <div className={cn(fullscreen && "fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-background p-4")}>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="content-title">Título</Label>
          <Input id="content-title" value={title} onChange={handleTitleChange} maxLength={300} />
        </div>

        <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start")}>
          <div className="min-w-0 flex-1">
            <RichEditor
              key={editorGeneration}
              content={displayedBody}
              projectId={projectId}
              brandContextText={brandContextText}
              onChangeHtml={handleBodyChange}
              onEditorReady={setEditorInstance}
              placeholder="Escribe el contenido..."
              initialBrandProfileId={initialMetadata.brandProfileId}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((prev) => !prev)}
            />
          </div>

          <EditorSidebar
            projectId={projectId}
            contentId={contentId}
            editor={editorInstance}
            title={title}
            bodyHtml={displayedBody}
            authorName={authorName}
            updatedAt={updatedAt}
            metadata={metadata}
            onMetadataChange={handleMetadataChange}
            publishChecklistRaw={publishChecklistRaw}
            versions={versions}
            brandContextText={brandContextText}
            onRestored={handleRestored}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setNoteDialogOpen(true)} disabled={savingVersion}>
            <History className="size-4" /> {savingVersion ? "Guardando versión..." : "Guardar versión"}
          </Button>
          <p className="text-xs text-muted-foreground">{AUTOSAVE_LABEL[combinedAutosaveStatus]}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Guardar versión&quot; crea un punto de restauración en el historial además del autoguardado continuo.
          {versionSaved ? " Versión guardada." : ""}
        </p>
      </div>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar versión</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="version-note">Nota (opcional)</Label>
            <Input
              id="version-note"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="Ej: Primer borrador revisado"
              maxLength={300}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveVersion} disabled={savingVersion}>
              {savingVersion ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

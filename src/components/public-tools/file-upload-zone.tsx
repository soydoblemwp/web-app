"use client";

import { useId, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared drag-and-drop + button file picker (spec section 24) — every
 * Fase 42 tool uses this instead of rolling its own. Works on mobile without
 * relying on drag-and-drop (the button + native file input always work via
 * tap), and never opens/processes a file before the caller's own validation
 * runs (this component only ever hands back the raw FileList).
 */
export function FileUploadZone({
  accept,
  multiple = false,
  onFilesSelected,
  label = "Arrastra tus archivos aquí, o",
  hint,
  disabled = false,
}: {
  accept: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center"
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
      }}
    >
      <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Seleccionar {multiple ? "archivos" : "archivo"}
      </Button>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        aria-label={multiple ? "Seleccionar archivos" : "Seleccionar archivo"}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadPerformanceImportFileAction, createJsonTextImportAction } from "@/server/actions/performance-imports";

type Kind = "file" | "json_text";

export function NewImportForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    const result = kind === "file" ? await submitFile() : await createJsonTextImportAction(projectId, jsonText);
    setPending(false);
    if (!result) return;
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Importación creada — configura el mapeo de columnas.");
    router.push(`/dashboard/${projectId}/performance/imports/${result.id}`);
  }

  async function submitFile() {
    if (!file) {
      toast.error("Selecciona un archivo .csv o .json.");
      return null;
    }
    const formData = new FormData();
    formData.set("file", file);
    return uploadPerformanceImportFileAction(projectId, formData);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border p-1">
        <Button type="button" size="sm" variant={kind === "file" ? "secondary" : "ghost"} className="flex-1" onClick={() => setKind("file")}>
          <FileText className="size-3.5" /> Archivo (CSV/JSON)
        </Button>
        <Button type="button" size="sm" variant={kind === "json_text" ? "secondary" : "ghost"} className="flex-1" onClick={() => setKind("json_text")}>
          <Type className="size-3.5" /> Pegar JSON
        </Button>
      </div>

      {kind === "file" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Archivo</Label>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Contenido JSON</Label>
          <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={6} placeholder='[{"date": "2026-07-01", "metric": "impressions", "value": 1200}]' />
        </div>
      )}

      <Button type="button" size="sm" disabled={pending} onClick={handleSubmit}>
        {pending ? "Subiendo…" : "Crear importación"}
      </Button>
    </div>
  );
}

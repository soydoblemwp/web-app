"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { FAQ_STATUS_LABELS, FAQ_STATUS_TONE } from "@/components/customer-support/labels";
import {
  createFaqAction,
  updateFaqAction,
  publishFaqAction,
  archiveFaqAction,
  duplicateFaqAction,
  importFaqsAction,
  exportFaqsAction,
} from "@/server/actions/customer-support";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  aliases: string[];
  priority: number;
  language: string;
  relatedLink: string | null;
  status: string;
  publishedAt: string | null;
}

const EMPTY_FORM = { question: "", answer: "", category: "", aliases: "", priority: "0", language: "es", relatedLink: "" };

export function FaqAdmin({ projectId, isManager, initialFaqs }: { projectId: string; isManager: boolean; initialFaqs: FaqRow[] }) {
  const [faqs] = useState(initialFaqs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: "publish" | "archive" } | null>(null);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importResult, setImportResult] = useState<string | null>(null);

  async function refresh() {
    location.reload();
  }

  const filtered = faqs.filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (search && !f.question.toLowerCase().includes(search.toLowerCase()) && !f.answer.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const payload = {
      question: form.question,
      answer: form.answer,
      category: form.category || null,
      aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      priority: Number(form.priority) || 0,
      language: form.language,
      relatedLink: form.relatedLink || null,
    };
    const result = editingId ? await updateFaqAction(projectId, editingId, payload) : await createFaqAction(projectId, payload);
    setBusy(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    await refresh();
  }

  function startEdit(faq: FaqRow) {
    setEditingId(faq.id);
    setForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category ?? "",
      aliases: faq.aliases.join(", "),
      priority: String(faq.priority),
      language: faq.language,
      relatedLink: faq.relatedLink ?? "",
    });
  }

  async function handleConfirmed() {
    if (!confirmTarget) return;
    setBusy(true);
    const action = confirmTarget.action === "publish" ? publishFaqAction : archiveFaqAction;
    const result = await action(projectId, confirmTarget.id);
    setBusy(false);
    setConfirmTarget(null);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function handleImport() {
    setBusy(true);
    setImportResult(null);
    const result = await importFaqsAction(projectId, importFormat, importText);
    setBusy(false);
    setImportResult(`Creadas: ${result.created} · Omitidas: ${result.skipped}${result.errors.length ? ` · ${result.errors[0]}` : ""}`);
    if (result.created > 0) await refresh();
  }

  async function handleExport(format: "csv" | "json") {
    const result = await exportFaqsAction(projectId, format);
    const blob = new Blob([result.text], { type: format === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faqs.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Editar FAQ" : "Nueva FAQ"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Pregunta</Label>
              <Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} maxLength={500} />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={100} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Respuesta</Label>
            <Textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} rows={4} maxLength={5000} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Palabras alternativas (separadas por coma)</Label>
              <Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Enlace relacionado</Label>
              <Input value={form.relatedLink} onChange={(e) => setForm({ ...form, relatedLink: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={busy || !form.question.trim() || !form.answer.trim()}>
              {editingId ? "Guardar cambios" : "Crear borrador"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">FAQ existentes</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-40" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicada</option>
              <option value="ARCHIVED">Archivada</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay FAQ que coincidan con el filtro.</p>
          ) : (
            filtered.map((faq) => (
              <div key={faq.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{faq.question}</span>
                  <Badge variant={FAQ_STATUS_TONE[faq.status] ?? "outline"}>{FAQ_STATUS_LABELS[faq.status] ?? faq.status}</Badge>
                  {faq.category ? <Badge variant="outline">{faq.category}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">{faq.answer.slice(0, 160)}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {faq.status !== "PUBLISHED" ? (
                    <Button size="sm" variant="outline" onClick={() => startEdit(faq)}>
                      Editar
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => duplicateFaqAction(projectId, faq.id).then(refresh)}>
                    Duplicar
                  </Button>
                  {isManager && faq.status !== "PUBLISHED" ? (
                    <Button size="sm" onClick={() => setConfirmTarget({ id: faq.id, action: "publish" })}>
                      Publicar
                    </Button>
                  ) : null}
                  {isManager && faq.status !== "ARCHIVED" ? (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmTarget({ id: faq.id, action: "archive" })}>
                      Archivar
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar / exportar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
              Exportar JSON
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select value={importFormat} onChange={(e) => setImportFormat(e.target.value as "csv" | "json")} className="rounded-md border bg-background px-2 text-sm">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
              <Button size="sm" onClick={handleImport} disabled={busy || !importText.trim()}>
                Importar (crea borradores)
              </Button>
            </div>
            <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={4} placeholder="Pega aqui el CSV o JSON..." />
            {importResult ? <p className="text-xs text-muted-foreground">{importResult}</p> : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.action === "publish" ? "Publicar FAQ" : "Archivar FAQ"}
        description={confirmTarget?.action === "publish" ? "Esta FAQ quedara disponible en el widget publico." : "Esta FAQ dejara de usarse en el widget publico."}
        confirmLabel={confirmTarget?.action === "publish" ? "Publicar" : "Archivar"}
        destructive={confirmTarget?.action === "archive"}
        onConfirm={handleConfirmed}
      />
    </div>
  );
}

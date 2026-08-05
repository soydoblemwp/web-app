"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2, Copy, FileDown, ExternalLink, History, Trash2 } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import {
  askKnowledgeBaseAction,
  completeKnowledgeQueryAction,
  failKnowledgeQueryAction,
  deleteKnowledgeQueryAction,
  saveQueryAsContentItemAction,
  getKnowledgeQueryAction,
} from "@/server/actions/knowledge-queries";
import { listCollectionsForSelectAction, listSourcesForSelectAction } from "@/server/actions/knowledge-select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface KnowledgeQueryHistoryItem {
  id: string;
  question: string;
  status: string;
  mode: string;
  createdAt: string;
  askedBy: { name: string | null; email: string };
}

export interface KnowledgeCitationItem {
  id: string;
  label: string;
  sourceTitleSnapshot: string;
  locationLabel: string | null;
  quoteSnapshot: string;
  citationType: string;
  sourceId: string | null;
}

interface AnswerState {
  queryId: string;
  answer: string;
  supportedFacts: string[];
  inferences: string[];
  recommendations: string[];
  missingInfo: string[];
  generalKnowledgeUsed: boolean;
  citations: KnowledgeCitationItem[];
  insufficientEvidence: boolean;
}

export function AskPanel({ projectId, history }: { projectId: string; history: KnowledgeQueryHistoryItem[] }) {
  const router = useRouter();
  const ai = useLocalAI();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"SOURCES_ONLY" | "SOURCES_PLUS_GENERAL">("SOURCES_ONLY");
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [sources, setSources] = useState<{ id: string; title: string }[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [maxSources, setMaxSources] = useState(8);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AnswerState | null>(null);

  useEffect(() => {
    listCollectionsForSelectAction(projectId).then(setCollections);
    listSourcesForSelectAction(projectId).then((s) => setSources(s.map((x) => ({ id: x.id, title: x.title }))));
  }, [projectId]);

  async function handleAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const prepared = await askKnowledgeBaseAction(projectId, {
        question,
        mode,
        collectionIds: selectedCollectionIds,
        sourceIds: selectedSourceIds,
        maxSources,
      });
      if ("error" in prepared && prepared.error) {
        toast.error(prepared.error);
        return;
      }
      if (!("queryId" in prepared)) return;

      if (prepared.insufficientEvidence) {
        setAnswer({
          queryId: prepared.queryId,
          answer: "La base de conocimiento no contiene evidencia suficiente para responder con las fuentes seleccionadas.",
          supportedFacts: [],
          inferences: [],
          recommendations: [],
          missingInfo: [question],
          generalKnowledgeUsed: false,
          citations: [],
          insufficientEvidence: true,
        });
        return;
      }

      if (!prepared.ai) return;
      const text = await ai.generate({ system: prepared.ai.systemPrompt, prompt: prepared.ai.userPrompt, maxTokens: 1536 });
      if (!text) {
        await failKnowledgeQueryAction(projectId, prepared.queryId, prepared.ai.executionToken, ai.error ?? "La generación falló.");
        toast.error(ai.error ?? "La generación falló o se canceló.");
        return;
      }

      const completed = await completeKnowledgeQueryAction(projectId, prepared.queryId, text, prepared.ai.executionToken);
      if ("error" in completed && completed.error) {
        toast.error(completed.error);
        return;
      }

      // Re-read the persisted query for its final structured answer + citations.
      const full = await getKnowledgeQueryAction(projectId, prepared.queryId);
      if (full) {
        setAnswer({
          queryId: full.id,
          answer: full.answer ?? "",
          supportedFacts: full.supportedFacts,
          inferences: full.inferences,
          recommendations: full.recommendations,
          missingInfo: full.missingInfo,
          generalKnowledgeUsed: full.generalKnowledgeUsed,
          citations: full.citations.map((c) => ({
            id: c.id,
            label: c.label,
            sourceTitleSnapshot: c.sourceTitleSnapshot,
            locationLabel: c.locationLabel,
            quoteSnapshot: c.quoteSnapshot,
            citationType: c.citationType,
            sourceId: c.sourceId,
          })),
          insufficientEvidence: false,
        });
      }
      router.refresh();
    } finally {
      setAsking(false);
    }
  }

  async function handleSaveAsContentItem() {
    if (!answer) return;
    const result = await saveQueryAsContentItemAction(projectId, answer.queryId, { mode: "create" });
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Guardado como contenido.");
  }

  async function handleDeleteHistory(id: string) {
    await deleteKnowledgeQueryAction(projectId, id);
    router.refresh();
  }

  function copyAnswer() {
    if (!answer) return;
    navigator.clipboard.writeText(answer.answer);
    toast.success("Respuesta copiada.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 py-4">
            <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Escribe tu pregunta sobre las fuentes del proyecto..." />

            <div className="flex flex-wrap items-center gap-2">
              <Select value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
                <SelectTrigger size="sm" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOURCES_ONLY">Solo fuentes seleccionadas</SelectItem>
                  <SelectItem value="SOURCES_PLUS_GENERAL">Fuentes + conocimiento general</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Máx. fuentes
                <input type="number" min={1} max={20} value={maxSources} onChange={(e) => setMaxSources(Number(e.target.value) || 8)} className="w-14 rounded border bg-transparent px-1 py-0.5" />
              </label>
            </div>

            {collections.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Colecciones</p>
                <div className="flex flex-wrap gap-2">
                  {collections.map((c) => {
                    const checked = selectedCollectionIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-1 text-xs">
                        <Checkbox checked={checked} onCheckedChange={() => setSelectedCollectionIds((prev) => (checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]))} />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {sources.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Fuentes específicas (opcional)</p>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                  {sources.map((s) => {
                    const checked = selectedSourceIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-1 text-xs">
                        <Checkbox checked={checked} onCheckedChange={() => setSelectedSourceIds((prev) => (checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]))} />
                        {s.title}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {ai.status === "unsupported" ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">Este navegador no admite el motor de IA local (WebGPU) — la búsqueda funciona, pero no se puede generar una respuesta redactada.</p>
            ) : null}

            <Button type="button" onClick={handleAsk} disabled={asking || !question.trim()}>
              {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Preguntar
            </Button>
          </CardContent>
        </Card>

        {answer ? (
          <Card className={answer.insufficientEvidence ? "border-amber-500/40" : undefined}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm whitespace-pre-wrap">{answer.answer}</p>
              </div>

              {answer.generalKnowledgeUsed ? <Badge variant="outline">Incluye conocimiento general</Badge> : null}

              {answer.supportedFacts.length > 0 ? (
                <AnswerSection title="Hechos respaldados" items={answer.supportedFacts} />
              ) : null}
              {answer.inferences.length > 0 ? <AnswerSection title="Inferencias" items={answer.inferences} /> : null}
              {answer.recommendations.length > 0 ? <AnswerSection title="Recomendaciones" items={answer.recommendations} /> : null}
              {answer.missingInfo.length > 0 ? <AnswerSection title="Información faltante" items={answer.missingInfo} /> : null}

              {answer.citations.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Citas</p>
                  {answer.citations.map((c) => (
                    <div key={c.id} className="rounded-lg border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {c.label} {c.sourceTitleSnapshot}
                          {c.locationLabel ? ` — ${c.locationLabel}` : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{c.citationType === "DIRECT" ? "Directa" : "Contextual"}</Badge>
                          {c.sourceId ? (
                            <Link href={`/dashboard/${projectId}/knowledge/sources/${c.sourceId}`} className="flex items-center gap-1 text-primary hover:underline">
                              <ExternalLink className="size-3" /> Abrir
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Fuente eliminada</span>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-muted-foreground">{c.quoteSnapshot}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {!answer.insufficientEvidence ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" onClick={copyAnswer}>
                    <Copy className="size-3.5" /> Copiar
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleSaveAsContentItem}>
                    <FileDown className="size-3.5" /> Guardar como contenido
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <History className="size-3.5" /> Historial
        </p>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin consultas todavía.</p>
        ) : (
          history.map((h) => (
            <Card key={h.id}>
              <CardContent className="space-y-1 py-2.5 text-xs">
                <p className="line-clamp-2 font-medium">{h.question}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{h.status}</Badge>
                  <button type="button" onClick={() => handleDeleteHistory(h.id)} title="Eliminar" className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function AnswerSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

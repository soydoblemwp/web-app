"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { prepareContentVerificationAction, finalizeContentVerificationAction } from "@/server/actions/knowledge-verification";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CLAIM_STATUS_LABELS } from "@/components/knowledge/labels";

interface ClaimResult {
  index: number;
  text: string;
  status: string;
  evidence: { sourceTitle: string; locationLabel: string | null; snippet: string; score: number }[];
}

const STATUS_TONE: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  SUPPORTED: "secondary",
  PARTIALLY_SUPPORTED: "outline",
  UNSUPPORTED: "destructive",
  CONTRADICTED: "destructive",
  OPINION: "outline",
  NOT_CHECKABLE: "outline",
};

/**
 * Content verification (spec section 26) — splits the ContentItem's body
 * into claims, checks each against real retrieved evidence (textual
 * overlap, always computed), and folds in an optional AI structured pass as
 * a second signal. Never presented as an absolute guarantee of truth.
 */
export function ContentVerificationPanel({ projectId, contentId }: { projectId: string; contentId: string }) {
  const ai = useLocalAI();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ClaimResult[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function handleVerify() {
    setRunning(true);
    setResults(null);
    try {
      const prepared = (await prepareContentVerificationAction(projectId, { contentItemId: contentId, collectionIds: [], sourceIds: [] })) as {
        error?: string;
        done?: boolean;
        results?: ClaimResult[];
        systemPrompt?: string;
        userPrompt?: string;
        claims?: { index: number; text: string }[];
        matches?: Record<string, { chunkId: string; sourceId: string; score: number; snippet: string; sourceTitle: string; locationLabel: string | null }[]>;
      };
      if (prepared.error) return;
      if (prepared.done) {
        setResults(prepared.results ?? []);
        return;
      }
      if (!prepared.systemPrompt || !prepared.userPrompt || !prepared.claims || !prepared.matches) return;

      const text = await ai.generate({ system: prepared.systemPrompt, prompt: prepared.userPrompt, maxTokens: 1024 });
      const final = await finalizeContentVerificationAction(projectId, prepared.claims, prepared.matches, text ?? undefined);
      setResults(final.results as ClaimResult[]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={handleVerify} disabled={running} className="w-full">
        {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} Verificar afirmaciones contra Knowledge Base
      </Button>

      {results ? (
        results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No se encontraron afirmaciones verificables en este contenido.</p>
        ) : (
          <div className="space-y-1">
            {results.map((r) => (
              <div key={r.index} className="rounded-lg border text-xs">
                <button type="button" className="flex w-full items-center gap-1.5 p-2 text-left" onClick={() => setExpanded(expanded === r.index ? null : r.index)}>
                  {expanded === r.index ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                  <span className="line-clamp-1 flex-1">{r.text}</span>
                  <Badge variant={STATUS_TONE[r.status] ?? "outline"}>{CLAIM_STATUS_LABELS[r.status] ?? r.status}</Badge>
                </button>
                {expanded === r.index && r.evidence.length > 0 ? (
                  <div className="space-y-1 border-t p-2 text-muted-foreground">
                    {r.evidence.map((e, i) => (
                      <p key={i}>
                        <span className="font-medium">{e.sourceTitle}</span>
                        {e.locationLabel ? ` — ${e.locationLabel}` : ""}: {e.snippet}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
      <p className="text-[11px] text-muted-foreground">La verificación combina coincidencia textual real con un análisis de IA opcional — no es una garantía absoluta de veracidad.</p>
    </div>
  );
}

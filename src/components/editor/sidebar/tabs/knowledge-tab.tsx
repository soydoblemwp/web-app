"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { Search, Loader2, PlusCircle, ExternalLink, Quote } from "lucide-react";
import { searchKnowledgeAction } from "@/server/actions/knowledge-search";
import { insertContentCitationAction, listContentCitationsAction } from "@/server/actions/knowledge-citations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContentVerificationPanel } from "@/components/editor/sidebar/tabs/content-verification-panel";
import type { KnowledgeSearchHit } from "@/server/services/knowledge-search";

interface ExistingCitation {
  id: string;
  label: string;
  sourceTitleSnapshot: string;
  locationLabel: string | null;
  quoteSnapshot: string;
}

/**
 * The AI Editor Pro "Knowledge" panel (spec section 25) — reuses the SAME
 * search service the Ask page and Knowledge Base hub use (never a second
 * search implementation), writes into the SAME editor instance every other
 * sidebar tab shares, and persists citations via ContentKnowledgeCitation so
 * they survive and stay verifiable after insertion. Never a parallel editor.
 */
export function KnowledgeTab({ projectId, contentId, editor }: { projectId: string; contentId: string; editor: Editor | null }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<KnowledgeSearchHit[]>([]);
  const [citations, setCitations] = useState<ExistingCitation[]>([]);

  useEffect(() => {
    listContentCitationsAction(projectId, contentId).then((rows) =>
      setCitations(rows.map((r) => ({ id: r.id, label: r.citationType, sourceTitleSnapshot: r.sourceTitleSnapshot, locationLabel: r.locationLabel, quoteSnapshot: r.quoteSnapshot })))
    );
  }, [projectId, contentId]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const result = await searchKnowledgeAction(projectId, { query, collectionIds: [], sourceIds: [], formats: [], includeArchived: false, limit: 10 });
      setResults(result.hits);
    } finally {
      setSearching(false);
    }
  }

  function insertFragment(hit: KnowledgeSearchHit) {
    if (!editor) return;
    editor.chain().focus().insertContent(`<blockquote>${hit.snippet}</blockquote>`).run();
    toast.success("Fragmento insertado.");
  }

  async function insertCitation(hit: KnowledgeSearchHit) {
    const result = await insertContentCitationAction(projectId, { contentItemId: contentId, chunkId: hit.chunkId, citationType: "DIRECT" });
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if (editor) {
      editor.chain().focus().insertContent(` <sup>[${hit.sourceTitle}]</sup> `).run();
    }
    const rows = await listContentCitationsAction(projectId, contentId);
    setCitations(rows.map((r) => ({ id: r.id, label: r.citationType, sourceTitleSnapshot: r.sourceTitleSnapshot, locationLabel: r.locationLabel, quoteSnapshot: r.quoteSnapshot })));
    toast.success("Cita insertada y guardada.");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="Buscar en Knowledge Base..." />
        <Button type="button" size="icon-sm" onClick={handleSearch} disabled={searching}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </div>

      <div className="space-y-1.5">
        {results.map((hit) => (
          <Card key={hit.chunkId}>
            <CardContent className="space-y-1.5 py-2.5 text-xs">
              <p className="font-medium">
                {hit.sourceTitle}
                {hit.locationLabel ? ` — ${hit.locationLabel}` : ""}
              </p>
              <p className="line-clamp-3 text-muted-foreground">{hit.snippet}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => insertFragment(hit)}>
                  <PlusCircle className="size-3.5" /> Insertar fragmento
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => insertCitation(hit)}>
                  <Quote className="size-3.5" /> Insertar cita
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {citations.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Fuentes usadas en este contenido</p>
          {citations.map((c) => (
            <div key={c.id} className="rounded-lg border p-2 text-[11px]">
              <p className="font-medium">
                {c.sourceTitleSnapshot}
                {c.locationLabel ? ` — ${c.locationLabel}` : ""}
              </p>
              <p className="text-muted-foreground">{c.quoteSnapshot}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Link href={`/dashboard/${projectId}/knowledge`} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <ExternalLink className="size-3" /> Abrir Knowledge Base
      </Link>

      <div className="border-t pt-3">
        <ContentVerificationPanel projectId={projectId} contentId={contentId} />
      </div>
    </div>
  );
}

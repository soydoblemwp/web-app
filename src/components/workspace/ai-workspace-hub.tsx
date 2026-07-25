"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceSearchFilter } from "@/components/workspace/workspace-search-filter";
import { WorkspaceResultCard } from "@/components/workspace/workspace-result-card";
import type { WorkspaceFilter, WorkspaceResult } from "@/lib/ai-workspace/types";

const RECENT_LIMIT = 20;

/**
 * Universal AI results workspace — the single history/search/favorites UI
 * every AI-generating tool's output flows through, regardless of which
 * platform or category produced it. `results` is already sorted by most
 * recently updated first (see listContentItems). `highlightId`, when set,
 * is already verified server-side (see the workspace page) to belong to
 * this project — it only ever selects an item already present in `results`.
 */
export function AiWorkspaceHub({
  projectId,
  results,
  highlightId = null,
}: {
  projectId: string;
  results: WorkspaceResult[];
  highlightId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const filtered = useMemo(() => {
    let list = results;

    if (filter === "favorites") list = list.filter((result) => result.isFavorite);
    if (filter === "recent") list = list.slice(0, RECENT_LIMIT);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (result) =>
          result.title.toLowerCase().includes(q) ||
          result.body.toLowerCase().includes(q) ||
          (result.toolLabel ?? "").toLowerCase().includes(q) ||
          (result.categoryLabel ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [results, filter, query]);

  return (
    <div className="space-y-6">
      <WorkspaceSearchFilter query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter} />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No se encontraron resultados.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((result) => (
            <WorkspaceResultCard
              key={result.id}
              projectId={projectId}
              result={result}
              highlighted={result.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

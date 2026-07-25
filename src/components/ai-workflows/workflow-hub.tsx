"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkflowCreateForm } from "@/components/ai-workflows/workflow-create-form";
import { WorkflowCard } from "@/components/ai-workflows/workflow-card";
import {
  filterWorkflows,
  sortWorkflows,
  getDistinctCategories,
  getDistinctTags,
  WORKFLOW_SORT_LABELS,
  type WorkflowSort,
} from "@/lib/ai-workflows/list-utils";
import type { WorkflowLike } from "@/lib/ai-workflows/types";

const ALL_VALUE = "__all__";

/** Client-side search/sort/filter over an already user+project-scoped workflow list — same shape as PromptLibraryHub/AiTemplateHub. */
export function WorkflowHub({ projectId, workflows }: { projectId: string; workflows: WorkflowLike[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "Ir al workflow padre/hijo" / "ir a la ejecución padre/hijo" navigation
  // links (see RunDetailPanel) land here as ?openWorkflow=<id>&openRun=<id>
  // — the matching card opens straight to its history, pre-scrolled into
  // view, instead of the user having to hunt for it in a possibly long list.
  const openWorkflowId = searchParams.get("openWorkflow");
  const openRunId = searchParams.get("openRun") ?? undefined;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WorkflowSort>("recent");
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  const categories = useMemo(() => getDistinctCategories(workflows), [workflows]);
  const tags = useMemo(() => getDistinctTags(workflows), [workflows]);

  const visible = useMemo(() => {
    const filtered = filterWorkflows(workflows, { query, category, tag, favoritesOnly, activeOnly });
    return sortWorkflows(filtered, sort);
  }, [workflows, query, category, tag, favoritesOnly, activeOnly, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WorkflowCreateForm projectId={projectId} onCreated={() => router.refresh()} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, descripción, categoría, etiqueta o paso..."
            className="pl-8"
            aria-label="Buscar en AI Workflows"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={favoritesOnly ? "secondary" : "outline"}
            size="sm"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((prev) => !prev)}
          >
            Favoritos
          </Button>
          <Button
            type="button"
            variant={activeOnly ? "secondary" : "outline"}
            size="sm"
            aria-pressed={activeOnly}
            onClick={() => setActiveOnly((prev) => !prev)}
          >
            Solo activos
          </Button>

          <Select value={category ?? ALL_VALUE} onValueChange={(value) => setCategory(value === ALL_VALUE ? null : value)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tag ?? ALL_VALUE} onValueChange={(value) => setTag(value === ALL_VALUE ? null : value)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todas las etiquetas</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => setSort(value as WorkflowSort)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(WORKFLOW_SORT_LABELS) as [WorkflowSort, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {workflows.length === 0 ? "Todavía no tienes workflows guardados." : "No se encontraron workflows con estos filtros."}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              projectId={projectId}
              workflow={workflow}
              initialMode={workflow.id === openWorkflowId ? "history" : undefined}
              focusRunId={workflow.id === openWorkflowId ? openRunId : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

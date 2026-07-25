"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiTemplateCreateForm } from "@/components/ai-templates/ai-template-create-form";
import { AiTemplateCard } from "@/components/ai-templates/ai-template-card";
import {
  filterAiTemplates,
  sortAiTemplates,
  getDistinctCategories,
  getDistinctTags,
  AI_TEMPLATE_SORT_LABELS,
  type AiTemplateSort,
} from "@/lib/ai-templates/list-utils";
import type { AiTemplateLike } from "@/lib/ai-templates/types";

const ALL_VALUE = "__all__";

/**
 * Client-side search/sort/filter over an already user+project-scoped
 * template list — same shape of responsibility as PromptLibraryHub, kept as
 * its own component because an AiTemplate isn't a SavedPrompt: it has
 * `variables` and a render/preview mode Prompt Library knows nothing about.
 */
export function AiTemplateHub({
  projectId,
  templates,
  brandVariables,
}: {
  projectId: string;
  templates: AiTemplateLike[];
  brandVariables: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AiTemplateSort>("recent");
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const categories = useMemo(() => getDistinctCategories(templates), [templates]);
  const tags = useMemo(() => getDistinctTags(templates), [templates]);

  const visible = useMemo(() => {
    const filtered = filterAiTemplates(templates, { query, category, tag, favoritesOnly });
    return sortAiTemplates(filtered, sort);
  }, [templates, query, category, tag, favoritesOnly, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AiTemplateCreateForm projectId={projectId} onCreated={() => router.refresh()} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, contenido, categoría, etiqueta o variable..."
            className="pl-8"
            aria-label="Buscar en AI Templates"
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

          <Select value={sort} onValueChange={(value) => setSort(value as AiTemplateSort)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(AI_TEMPLATE_SORT_LABELS) as [AiTemplateSort, string][]).map(([value, label]) => (
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
          {templates.length === 0 ? "Todavía no tienes templates guardados." : "No se encontraron templates con estos filtros."}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((template) => (
            <AiTemplateCard key={template.id} projectId={projectId} template={template} brandVariables={brandVariables} />
          ))}
        </div>
      )}
    </div>
  );
}

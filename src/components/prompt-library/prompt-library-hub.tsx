"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PromptLibraryCreateForm } from "@/components/prompt-library/prompt-library-create-form";
import { PromptLibraryCard } from "@/components/prompt-library/prompt-library-card";
import {
  filterSavedPrompts,
  sortSavedPrompts,
  getDistinctCategories,
  getDistinctTags,
  PROMPT_LIBRARY_SORT_LABELS,
  type PromptLibrarySort,
} from "@/lib/prompt-library/list-utils";
import type { SavedPromptLike } from "@/lib/prompt-library/types";

const ALL_VALUE = "__all__";

/**
 * Client-side search/sort/filter over an already user+project-scoped prompt
 * list — same shape of responsibility as AiWorkspaceHub, kept as its own
 * component (rather than reusing AiWorkspaceHub directly) because a
 * SavedPrompt isn't a ContentItem: it has no status/type, but does have
 * category, tags and usage history AiWorkspaceHub knows nothing about.
 */
export function PromptLibraryHub({
  projectId,
  prompts,
  defaultBrandContext,
}: {
  projectId: string;
  prompts: SavedPromptLike[];
  defaultBrandContext: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PromptLibrarySort>("recent");
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const categories = useMemo(() => getDistinctCategories(prompts), [prompts]);
  const tags = useMemo(() => getDistinctTags(prompts), [prompts]);

  const visible = useMemo(() => {
    const filtered = filterSavedPrompts(prompts, { query, category, tag, favoritesOnly });
    return sortSavedPrompts(filtered, sort);
  }, [prompts, query, category, tag, favoritesOnly, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PromptLibraryCreateForm projectId={projectId} onCreated={() => router.refresh()} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, contenido, categoría o etiqueta..."
            className="pl-8"
            aria-label="Buscar en la biblioteca de prompts"
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

          <Select value={sort} onValueChange={(value) => setSort(value as PromptLibrarySort)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PROMPT_LIBRARY_SORT_LABELS) as [PromptLibrarySort, string][]).map(([value, label]) => (
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
          {prompts.length === 0 ? "Todavía no tienes prompts guardados." : "No se encontraron prompts con estos filtros."}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((prompt) => (
            <PromptLibraryCard key={prompt.id} projectId={projectId} prompt={prompt} defaultBrandContext={defaultBrandContext} />
          ))}
        </div>
      )}
    </div>
  );
}

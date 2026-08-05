"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PublicToolCard } from "@/components/public-tools/public-tool-card";
import type { PublicToolCategoryDefinition, PublicToolDefinition } from "@/lib/public-tools/types";

export function ToolsExplorer({
  tools,
  categories,
  initialCategory,
}: {
  tools: PublicToolDefinition[];
  categories: PublicToolCategoryDefinition[];
  initialCategory?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory ?? null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (activeCategory && tool.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      const haystack = [tool.name, tool.shortDescription, ...tool.keywords].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [tools, query, activeCategory]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una herramienta..."
            className="pl-8"
            aria-label="Buscar una herramienta"
          />
        </div>
      </div>

      <div role="group" aria-label="Filtrar por categoría" className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeCategory === null ? "default" : "outline"}
          size="sm"
          aria-pressed={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        >
          Todas
        </Button>
        {categories.map((category) => (
          <Button
            key={category.slug}
            type="button"
            variant={activeCategory === category.slug ? "default" : "outline"}
            size="sm"
            aria-pressed={activeCategory === category.slug}
            onClick={() => setActiveCategory(category.slug)}
          >
            {category.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No encontramos ninguna herramienta que coincida con tu búsqueda. Prueba con otra palabra o quita el filtro de categoría.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <PublicToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

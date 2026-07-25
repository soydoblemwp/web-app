"use client";

import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkspaceFilter } from "@/lib/ai-workspace/types";

const FILTER_LABELS: Record<WorkspaceFilter, string> = {
  all: "Todos",
  favorites: "Favoritos",
  recent: "Recientes",
};

const FILTERS: WorkspaceFilter[] = ["all", "favorites", "recent"];

export function WorkspaceSearchFilter({
  query,
  onQueryChange,
  filter,
  onFilterChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: WorkspaceFilter;
  onFilterChange: (value: WorkspaceFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-md flex-1">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por título, contenido, herramienta o categoría..."
          className="pl-8"
          aria-label="Buscar en el historial"
        />
      </div>
      <div className="flex items-center gap-0.5 rounded-lg border p-0.5" role="group" aria-label="Filtro">
        {FILTERS.map((value) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={filter === value}
            onClick={() => onFilterChange(value)}
          >
            {FILTER_LABELS[value]}
          </Button>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search as SearchIcon, Clock } from "lucide-react";
import { AI_CENTER_CATEGORIES, getAllAiTools } from "@/lib/ai-center/registry";
import { ToolGrid } from "@/components/ai-center/tool-grid";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AiCenterHub({
  projectId,
  favoriteSlugs,
  recentSlugs,
}: {
  projectId: string;
  favoriteSlugs: string[];
  recentSlugs: string[];
}) {
  const [query, setQuery] = useState("");
  const favoriteSet = useMemo(() => new Set(favoriteSlugs), [favoriteSlugs]);
  const allTools = useMemo(() => getAllAiTools(), []);

  const favoriteTools = useMemo(
    () => allTools.filter((tool) => favoriteSet.has(tool.slug)),
    [allTools, favoriteSet]
  );

  const recentTools = useMemo(() => {
    const bySlug = new Map(allTools.map((tool) => [tool.slug, tool]));
    return recentSlugs.map((slug) => bySlug.get(slug)).filter((tool): tool is (typeof allTools)[number] => Boolean(tool));
  }, [allTools, recentSlugs]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allTools.filter(
      (tool) =>
        tool.label.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.categoryLabel.toLowerCase().includes(q)
    );
  }, [allTools, query]);

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar herramientas..."
          className="pl-8"
          aria-label="Buscar herramientas"
        />
      </div>

      {searchResults ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {searchResults.length} resultado{searchResults.length === 1 ? "" : "s"}
          </h2>
          <ToolGrid tools={searchResults} projectId={projectId} favoriteSlugs={favoriteSet} />
        </section>
      ) : (
        <>
          {favoriteTools.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Favoritos</h2>
              <ToolGrid tools={favoriteTools} projectId={projectId} favoriteSlugs={favoriteSet} />
            </section>
          ) : null}

          {recentTools.length > 0 ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Clock className="size-4" /> Recientes
              </h2>
              <ToolGrid tools={recentTools} projectId={projectId} favoriteSlugs={favoriteSet} />
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Categorías</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AI_CENTER_CATEGORIES.map((category) => {
                const availableCount = category.tools.filter((tool) => tool.status === "available").length;
                const comingSoonCount = category.tools.length - availableCount;
                const Icon = category.icon;
                return (
                  <Link key={category.slug} href={`/dashboard/${projectId}/ai-center/${category.slug}`}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          {category.label}
                        </CardTitle>
                        <CardDescription>{category.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-1.5">
                        {availableCount > 0 ? (
                          <Badge variant="secondary">
                            {availableCount} disponible{availableCount === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                        {comingSoonCount > 0 ? <Badge variant="outline">{comingSoonCount} próximamente</Badge> : null}
                        {category.tools.length === 0 ? <Badge variant="outline">Próximamente</Badge> : null}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

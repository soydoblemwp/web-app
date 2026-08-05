"use client";

import { useMemo } from "react";
import { platformLabel, COMPOSER_PLATFORM_VALUES } from "@/lib/publishing/platform-specs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PublicationData } from "@/components/publishing/types";

export function PerformanceView({ publications }: { projectId: string; publications: PublicationData[] }) {
  const stats = useMemo(() => {
    const published = publications.filter((p) => p.status === "PUBLISHED");
    const byPlatform = COMPOSER_PLATFORM_VALUES.map((platform) => ({
      platform,
      total: publications.filter((p) => p.platform === platform).length,
      published: publications.filter((p) => p.platform === platform && p.status === "PUBLISHED").length,
    })).filter((row) => row.total > 0);

    const total = publications.length;
    const publishRate = total === 0 ? 0 : Math.round((published.length / total) * 100);

    return { published, byPlatform, publishRate, total };
  }, [publications]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total de publicaciones</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Publicadas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.published.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tasa de publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-2xl font-semibold">{stats.publishRate}%</p>
            <Progress value={stats.publishRate} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Por plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.byPlatform.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin publicaciones todavía.</p>
          ) : (
            stats.byPlatform.map((row) => (
              <div key={row.platform} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{platformLabel(row.platform)}</span>
                  <span className="text-muted-foreground">
                    {row.published}/{row.total} publicadas
                  </span>
                </div>
                <Progress value={row.total === 0 ? 0 : Math.round((row.published / row.total) * 100)} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Las métricas de alcance/impresiones/clics se registran manualmente por publicación una vez publicada — esta fase no conecta
        APIs externas de redes sociales.
      </p>
    </div>
  );
}

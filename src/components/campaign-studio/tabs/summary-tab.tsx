"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS } from "@/lib/campaign-studio/piece-status";
import { campaignChannelLabel } from "@/lib/campaign-studio/channels";
import { CAMPAIGN_METRIC_TYPE_LABELS, computeMetricProgress } from "@/lib/campaign-studio/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { CampaignDetailData, CampaignPieceData, CampaignPillarData, MetricGoalData } from "@/components/campaign-studio/types";

export function SummaryTab({
  projectId,
  campaign,
  pillars,
  pieces,
  metricGoals,
  ownerName,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  pillars: CampaignPillarData[];
  pieces: CampaignPieceData[];
  metricGoals: MetricGoalData[];
  ownerName: string;
}) {
  // Frozen at mount rather than read fresh on every render — Date.now() is
  // an impure call and React requires render to be deterministic; a lazy
  // useState initializer runs exactly once, which is fine here since
  // "now" only needs to be accurate to within a page visit, not live.
  const [now] = useState(() => Date.now());

  const stats = useMemo(() => {
    const published = pieces.filter((p) => p.status === "PUBLISHED").length;
    const progress = pieces.length === 0 ? 0 : Math.round((published / pieces.length) * 100);

    const byStatus = CAMPAIGN_PIECE_STATUS_VALUES.map((status) => ({
      status,
      count: pieces.filter((p) => p.status === status).length,
    }));

    const platforms = Array.from(new Set(pieces.map((p) => p.platform)));
    const byPlatform = platforms.map((platform) => ({ platform, count: pieces.filter((p) => p.platform === platform).length }));

    const upcoming = pieces
      .filter((p) => p.scheduledDate && new Date(p.scheduledDate).getTime() >= now && p.status !== "PUBLISHED" && p.status !== "CANCELLED")
      .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())
      .slice(0, 5);

    const overdue = pieces.filter(
      (p) => p.scheduledDate && new Date(p.scheduledDate).getTime() < now && p.status !== "PUBLISHED" && p.status !== "CANCELLED"
    );

    const byPillar = pillars.map((pillar) => {
      const total = pieces.filter((p) => p.pillarId === pillar.id).length;
      const done = pieces.filter((p) => p.pillarId === pillar.id && p.status === "PUBLISHED").length;
      return { pillar, total, done };
    });

    const recent = [...pieces].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6);

    return { progress, byStatus, byPlatform, upcoming, overdue, byPillar, recent };
  }, [pieces, pillars, now]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Progreso general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-2xl font-semibold">{stats.progress}%</p>
            <Progress value={stats.progress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Piezas totales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{pieces.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Atrasadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{stats.overdue.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Responsable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="truncate text-sm font-medium">{ownerName}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Piezas por estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.byStatus.map(({ status, count }) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{CAMPAIGN_PIECE_STATUS_LABELS[status]}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Piezas por plataforma</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.byPlatform.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin piezas todavía.</p>
            ) : (
              stats.byPlatform.map(({ platform, count }) => (
                <div key={platform} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{campaignChannelLabel(platform)}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Próximos contenidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay piezas programadas próximamente.</p>
            ) : (
              stats.upcoming.map((piece) => (
                <div key={piece.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{piece.title}</span>
                  <span className="text-muted-foreground">{new Date(piece.scheduledDate!).toLocaleDateString("es-ES")}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avance por pilar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.byPillar.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin pilares definidos todavía.</p>
            ) : (
              stats.byPillar.map(({ pillar, total, done }) => (
                <div key={pillar.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: pillar.color ?? "var(--muted-foreground)" }} />
                      {pillar.name}
                    </span>
                    <span className="text-muted-foreground">
                      {done}/{total}
                    </span>
                  </div>
                  <Progress value={total === 0 ? 0 : Math.round((done / total) * 100)} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {metricGoals.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Métricas objetivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metricGoals.map((goal) => {
                const progress = computeMetricProgress(goal.targetValue, goal.currentValue);
                return (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{CAMPAIGN_METRIC_TYPE_LABELS[goal.metricType as keyof typeof CAMPAIGN_METRIC_TYPE_LABELS]}</span>
                      <span className="text-muted-foreground">
                        {goal.currentValue} / {goal.targetValue}
                      </span>
                    </div>
                    <Progress value={Math.min(100, progress.percent)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin actividad todavía.</p>
            ) : (
              stats.recent.map((piece) => (
                <div key={piece.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{piece.title}</span>
                  <Badge variant="outline">{CAMPAIGN_PIECE_STATUS_LABELS[piece.status as keyof typeof CAMPAIGN_PIECE_STATUS_LABELS]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {campaign.brandProfileName ? (
        <p className="text-xs text-muted-foreground">Brand Profile: {campaign.brandProfileName}</p>
      ) : null}

      <Link href={`/dashboard/${projectId}/knowledge?campaignId=${campaign.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <BookOpen className="size-3.5" /> Ver fuentes de investigación en Knowledge Base
      </Link>
    </div>
  );
}

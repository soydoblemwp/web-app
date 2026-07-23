import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Analíticas" };

export default async function AnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const [contentByStatus, contentByType, postsByPlatform, postsByStatus, campaignsByStatus, aiUsage, metricsSum, automationRuns, linksByStatus] =
    await Promise.all([
      prisma.contentItem.groupBy({ by: ["status"], where: { projectId, deletedAt: null }, _count: true }),
      prisma.contentItem.groupBy({ by: ["type"], where: { projectId, deletedAt: null }, _count: true }),
      prisma.socialPost.groupBy({ by: ["platform"], where: { projectId }, _count: true }),
      prisma.socialPost.groupBy({ by: ["status"], where: { projectId }, _count: true }),
      prisma.campaign.groupBy({ by: ["status"], where: { projectId }, _count: true }),
      prisma.aIUsage.aggregate({ where: { projectId }, _sum: { inputTokens: true, outputTokens: true }, _count: true }),
      prisma.socialMetric.aggregate({
        where: { socialPost: { projectId } },
        _sum: { views: true, likes: true, comments: true, shares: true, clicks: true },
      }),
      prisma.automationRun.count({ where: { automation: { projectId } } }),
      prisma.linkCheck.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analíticas</h1>
        <p className="text-sm text-muted-foreground">
          Datos reales guardados por la plataforma. Los resultados de redes sociales se introducen manualmente o se
          importan — nunca se inventan.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Generaciones de IA" value={aiUsage._count} sub={`${(aiUsage._sum.inputTokens ?? 0) + (aiUsage._sum.outputTokens ?? 0)} tokens`} />
        <StatCard label="Automatizaciones ejecutadas" value={automationRuns} />
        <StatCard label="Vistas registradas" value={metricsSum._sum.views ?? 0} />
        <StatCard label="Me gusta registrados" value={metricsSum._sum.likes ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupCard title="Contenido por estado" rows={contentByStatus.map((r) => ({ label: r.status, count: r._count }))} />
        <GroupCard title="Contenido por tipo" rows={contentByType.map((r) => ({ label: r.type, count: r._count }))} />
        <GroupCard title="Publicaciones por plataforma" rows={postsByPlatform.map((r) => ({ label: r.platform, count: r._count }))} />
        <GroupCard title="Publicaciones por estado" rows={postsByStatus.map((r) => ({ label: r.status, count: r._count }))} />
        <GroupCard title="Campañas por estado" rows={campaignsByStatus.map((r) => ({ label: r.status, count: r._count }))} />
        <GroupCard title="Enlaces por estado" rows={linksByStatus.map((r) => ({ label: r.status, count: r._count }))} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function GroupCard({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((row) => (
              <li key={row.label} className="flex justify-between">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

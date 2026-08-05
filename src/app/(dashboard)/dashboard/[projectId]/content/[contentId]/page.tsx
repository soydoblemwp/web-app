import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Star, Copy, Archive, Trash2, Rocket, LineChart } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { getContentItem } from "@/server/services/content";
import { listMetricRecordsAction } from "@/server/actions/performance-metrics";
import { listRecommendationsAction } from "@/server/actions/performance-recommendations";
import {
  toggleFavoriteContentAction,
  archiveContentAction,
  deleteContentAction,
  duplicateContentAction,
} from "@/server/actions/content";
import { ContentEditorPanel } from "@/components/content/content-editor-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContentMetadata, VersionSummary } from "@/components/editor/sidebar/types";

export const metadata: Metadata = { title: "Contenido" };

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; contentId: string }>;
}) {
  const { projectId, contentId } = await params;
  const item = await getContentItem(contentId);
  if (!item || item.projectId !== projectId) notFound();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  const initialMetadata: ContentMetadata = {
    status: item.status,
    channel: item.channel ?? "",
    objective: item.objective ?? "",
    tone: item.tone ?? "",
    targetAudience: item.targetAudience ?? "",
    cta: item.cta ?? "",
    seoKeyword: item.seoKeyword ?? "",
    seoTitle: item.seoTitle ?? "",
    seoDescription: item.seoDescription ?? "",
    slug: item.slug ?? "",
    searchIntent: item.searchIntent ?? "",
    brandProfileId: item.brandProfileId ?? null,
  };

  const [performanceRecords, performanceRecommendations] = await Promise.all([
    listMetricRecordsAction(projectId, { contentItemId: item.id, limit: 1 }),
    listRecommendationsAction(projectId, { status: "NEW", limit: 200 }),
  ]);
  const pendingRecommendationsForItem = performanceRecommendations.filter((r) => r.contentItem?.id === item.id).length;

  const versions: VersionSummary[] = item.versions.map((version) => ({
    id: version.id,
    title: version.title,
    body: version.body,
    note: version.note,
    createdAt: version.createdAt.toISOString(),
    authorName: version.author.name || version.author.email,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary">{item.type}</Badge>
            <Badge variant="outline">{item.status}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          <p className="text-xs text-muted-foreground">
            Autor: {item.author.name || item.author.email} · Actualizado {item.updatedAt.toLocaleString("es-ES")}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <form action={toggleFavoriteContentAction.bind(null, projectId, item.id, !item.isFavorite)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Favorito">
              <Star className={item.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
            </Button>
          </form>
          <form action={duplicateContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Duplicar">
              <Copy className="size-4" />
            </Button>
          </form>
          <form action={archiveContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Archivar">
              <Archive className="size-4" />
            </Button>
          </form>
          <form action={deleteContentAction.bind(null, projectId, item.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Eliminar">
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      {item.campaignPiece ? (
        <Link
          href={`/dashboard/${projectId}/campaign-studio/${item.campaignPiece.campaign.id}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs hover:border-primary/50"
        >
          <Rocket className="size-3.5 text-primary" />
          <span>
            Creado desde la campaña <strong>{item.campaignPiece.campaign.name}</strong>
          </span>
          {item.campaignPiece.pillar ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              · Pilar: <span className="size-1.5 rounded-full" style={{ backgroundColor: item.campaignPiece.pillar.color ?? "var(--muted-foreground)" }} />
              {item.campaignPiece.pillar.name}
            </span>
          ) : null}
          {item.campaignPiece.scheduledDate ? (
            <span className="text-muted-foreground">
              · Fecha prevista: {item.campaignPiece.scheduledDate.toLocaleDateString("es-ES")}
            </span>
          ) : null}
        </Link>
      ) : null}

      <Link
        href={`/dashboard/${projectId}/performance/content`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:bg-accent/50"
      >
        <span className="flex items-center gap-1.5">
          <LineChart className="size-3.5" /> Performance Intelligence
        </span>
        <span>
          {performanceRecords.length > 0 ? "Con datos registrados" : "Sin datos todavía"}
          {pendingRecommendationsForItem > 0 ? ` · ${pendingRecommendationsForItem} recomendación(es) pendiente(s)` : ""} — abrir Performance Center
        </span>
      </Link>

      <ContentEditorPanel
        projectId={projectId}
        contentId={item.id}
        initialTitle={item.title}
        initialBody={item.body}
        brandContextText={brandContextText}
        authorName={item.author.name || item.author.email}
        updatedAt={item.updatedAt.toISOString()}
        initialMetadata={initialMetadata}
        publishChecklistRaw={item.publishChecklist}
        versions={versions}
      />
    </div>
  );
}

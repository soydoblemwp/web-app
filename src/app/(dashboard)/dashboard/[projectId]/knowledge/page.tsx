import type { Metadata } from "next";
import { BrainCog } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listSourcesAction } from "@/server/actions/knowledge-sources";
import { listCollectionsAction } from "@/server/actions/knowledge-collections";
import { KnowledgeHub, type KnowledgeSourceListItem, type KnowledgeCollectionListItem } from "@/components/knowledge/knowledge-hub";

export const metadata: Metadata = { title: "Knowledge Base" };

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ campaignId?: string }>;
}) {
  const { projectId } = await params;
  const { campaignId } = await searchParams;
  await requireProjectAccess(projectId, "VIEWER");

  const [sources, collections] = await Promise.all([
    listSourcesAction(projectId, { includeArchived: true, ...(campaignId ? { campaignId } : {}) }),
    listCollectionsAction(projectId, true),
  ]);

  const sourceItems: KnowledgeSourceListItem[] = sources.map((s) => ({
    id: s.id,
    title: s.title,
    format: s.format,
    status: s.status,
    originType: s.originType,
    isArchived: s.isArchived,
    updatedAt: s.updatedAt.toISOString(),
    charCount: s.activeVersion?.charCount ?? 0,
    versionCount: s._count.versions,
    collectionIds: s.collections.map((c) => c.collectionId),
  }));

  const collectionItems: KnowledgeCollectionListItem[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    color: c.color,
    status: c.status,
    sourceCount: c._count.sources,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BrainCog className="size-6" /> Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground">Documentos, colecciones y búsqueda con fuentes reales para tus agentes, editor y campañas.</p>
      </div>

      <KnowledgeHub projectId={projectId} sources={sourceItems} collections={collectionItems} />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/permissions";
import { getSourceAction } from "@/server/actions/knowledge-sources";
import { listCollectionsForSelectAction } from "@/server/actions/knowledge-select";
import { SourceDetail, type SourceDetailData } from "@/components/knowledge/source-detail";

export const metadata: Metadata = { title: "Fuente — Knowledge Base" };

export default async function KnowledgeSourcePage({ params }: { params: Promise<{ projectId: string; sourceId: string }> }) {
  const { projectId, sourceId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const [source, allCollections] = await Promise.all([getSourceAction(projectId, sourceId), listCollectionsForSelectAction(projectId)]);
  if (!source) notFound();

  const data: SourceDetailData = {
    id: source.id,
    title: source.title,
    description: source.description,
    format: source.format,
    status: source.status,
    originType: source.originType,
    syncMode: source.syncMode,
    isArchived: source.isArchived,
    sensitiveWarning: source.sensitiveWarning,
    lastErrorMessage: source.lastErrorMessage,
    fileAsset: source.fileAsset ? { id: source.fileAsset.id, originalName: source.fileAsset.originalName, url: source.fileAsset.url } : null,
    activeVersion: source.activeVersion
      ? {
          id: source.activeVersion.id,
          version: source.activeVersion.version,
          status: source.activeVersion.status,
          extractionQuality: source.activeVersion.extractionQuality,
          warnings: source.activeVersion.warnings,
          pageCount: source.activeVersion.pageCount,
          sectionCount: source.activeVersion.sectionCount,
          charCount: source.activeVersion.charCount,
          normalizedText: source.activeVersion.normalizedText,
          chunkCount: source.activeVersion._count.chunks,
        }
      : null,
    versions: source.versions.map((v) => ({ id: v.id, version: v.version, status: v.status, createdAt: v.createdAt.toISOString(), chunkCount: v._count.chunks })),
    collections: source.collections.map((c) => ({ collectionId: c.collectionId, name: c.collection.name })),
  };

  return <SourceDetail projectId={projectId} source={data} allCollections={allCollections} />;
}

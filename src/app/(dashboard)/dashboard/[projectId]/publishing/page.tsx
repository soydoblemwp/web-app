import type { Metadata } from "next";
import { Rocket } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listPublications } from "@/server/services/publishing";
import { listProjectMembersForCampaignStudio } from "@/server/services/campaign-studio";
import { NewPublicationMenu } from "@/components/publishing/new-publication-menu";
import { PublishingHub } from "@/components/publishing/publishing-hub";
import type { PublicationData } from "@/components/publishing/types";

export const metadata: Metadata = { title: "Publishing Hub" };

export default async function PublishingHubPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const [posts, members] = await Promise.all([listPublications(projectId), listProjectMembersForCampaignStudio(projectId)]);

  const publications: PublicationData[] = posts.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    platform: p.platform,
    format: p.format,
    internalTitle: p.internalTitle,
    text: p.text,
    firstComment: p.firstComment,
    hashtags: p.hashtags,
    cta: p.cta,
    link: p.link,
    altText: p.altText,
    status: p.status,
    priority: p.priority,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    timezone: p.timezone,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    notes: p.notes,
    campaignId: p.campaignId,
    campaignName: p.campaign?.name ?? null,
    brandProfileId: p.brandProfileId,
    brandProfileName: p.brandProfile?.name ?? null,
    assigneeId: p.assigneeId,
    assignee: p.assignee,
    approverId: p.approverId,
    approver: p.approver,
    authorId: p.authorId,
    author: p.author,
    sourceContentId: p.sourceContentId,
    sourcePieceId: p.sourcePieceId,
    sourcePieceTitle: p.sourcePiece?.title ?? null,
    media: p.media.map((m) => ({
      fileAsset: {
        id: m.fileAsset.id,
        kind: m.fileAsset.kind,
        displayName: m.fileAsset.displayName,
        originalName: m.fileAsset.originalName,
        url: m.fileAsset.url,
        mimeType: m.fileAsset.mimeType,
        sizeBytes: m.fileAsset.sizeBytes,
        widthPx: m.fileAsset.widthPx,
        heightPx: m.fileAsset.heightPx,
        durationSec: m.fileAsset.durationSec,
        altText: m.fileAsset.altText,
        tags: m.fileAsset.tags,
        rightsSource: m.fileAsset.rightsSource,
        isArchived: m.fileAsset.isArchived,
        createdAt: m.fileAsset.createdAt.toISOString(),
      },
      altTextOverride: m.altTextOverride,
      order: m.order,
    })),
    queuePosition: p.queuePosition,
    isPaused: p.isPaused,
    attemptCount: p.attemptCount,
    lastAttemptAt: p.lastAttemptAt ? p.lastAttemptAt.toISOString() : null,
    nextAttemptAt: p.nextAttemptAt ? p.nextAttemptAt.toISOString() : null,
    lastErrorProvider: p.lastErrorProvider,
    lastErrorCode: p.lastErrorCode,
    lastErrorMessage: p.lastErrorMessage,
    isRetryable: p.isRetryable,
    checklistState: p.checklistState as Record<string, boolean> | null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Rocket className="size-6" /> Publishing Hub
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepara, adapta, aprueba, programa y gestiona contenido para múltiples plataformas desde un único lugar.
          </p>
        </div>
        <NewPublicationMenu projectId={projectId} />
      </div>

      <PublishingHub projectId={projectId} publications={publications} members={members} currentUserId={user.id} />
    </div>
  );
}

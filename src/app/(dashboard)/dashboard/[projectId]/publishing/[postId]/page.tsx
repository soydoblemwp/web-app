import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getPublication } from "@/server/services/publishing";
import { listProjectMembersForCampaignStudio } from "@/server/services/campaign-studio";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { prisma } from "@/lib/db/prisma";
import { PublicationComposer } from "@/components/publishing/composer/publication-composer";
import type { PublicationData } from "@/components/publishing/types";

export const metadata: Metadata = { title: "Publicación" };

export default async function PublicationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; postId: string }>;
}) {
  const { projectId, postId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const post = await getPublication(postId);
  if (!post || post.projectId !== projectId) notFound();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const [members, campaigns, brandProfiles] = await Promise.all([
    listProjectMembersForCampaignStudio(projectId),
    listCampaignsForSelectAction(projectId),
    listBrandProfilesForSelectAction(projectId),
  ]);

  const publication: PublicationData = {
    id: post.id,
    projectId: post.projectId,
    platform: post.platform,
    format: post.format,
    internalTitle: post.internalTitle,
    text: post.text,
    firstComment: post.firstComment,
    hashtags: post.hashtags,
    cta: post.cta,
    link: post.link,
    altText: post.altText,
    status: post.status,
    priority: post.priority,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    timezone: post.timezone,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    notes: post.notes,
    campaignId: post.campaignId,
    campaignName: post.campaign?.name ?? null,
    brandProfileId: post.brandProfileId,
    brandProfileName: post.brandProfile?.name ?? null,
    assigneeId: post.assigneeId,
    assignee: post.assignee,
    approverId: post.approverId,
    approver: post.approver,
    authorId: post.authorId,
    author: post.author,
    sourceContentId: post.sourceContentId,
    sourcePieceId: post.sourcePieceId,
    sourcePieceTitle: post.sourcePiece?.title ?? null,
    media: post.media.map((m) => ({
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
    queuePosition: post.queuePosition,
    isPaused: post.isPaused,
    attemptCount: post.attemptCount,
    lastAttemptAt: post.lastAttemptAt ? post.lastAttemptAt.toISOString() : null,
    nextAttemptAt: post.nextAttemptAt ? post.nextAttemptAt.toISOString() : null,
    lastErrorProvider: post.lastErrorProvider,
    lastErrorCode: post.lastErrorCode,
    lastErrorMessage: post.lastErrorMessage,
    isRetryable: post.isRetryable,
    checklistState: post.checklistState as Record<string, boolean> | null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/dashboard/${projectId}/publishing`} className="hover:text-foreground hover:underline">
          Publishing Hub
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{post.internalTitle || "Publicación"}</span>
      </nav>

      <PublicationComposer
        projectId={projectId}
        publication={publication}
        members={members}
        campaigns={campaigns}
        brandProfiles={brandProfiles}
        currentUserId={user.id}
        requireApprovalBeforePublish={project.requireApprovalBeforePublish}
        allowSelfApproval={project.allowSelfApproval}
      />
    </div>
  );
}

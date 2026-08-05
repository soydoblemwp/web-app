export interface MemberSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface MediaAssetData {
  id: string;
  kind: string;
  displayName: string | null;
  originalName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  durationSec: number | null;
  altText: string | null;
  tags: string[];
  rightsSource: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface PublicationMediaData {
  fileAsset: MediaAssetData;
  altTextOverride: string | null;
  order: number;
}

export interface PublicationData {
  id: string;
  projectId: string;
  platform: string;
  format: string | null;
  internalTitle: string | null;
  text: string;
  firstComment: string | null;
  hashtags: string[];
  cta: string | null;
  link: string | null;
  altText: string | null;
  status: string;
  priority: string;
  scheduledAt: string | null;
  timezone: string;
  publishedAt: string | null;
  notes: string | null;
  campaignId: string | null;
  campaignName: string | null;
  brandProfileId: string | null;
  brandProfileName: string | null;
  assigneeId: string | null;
  assignee: MemberSummary | null;
  approverId: string | null;
  approver: MemberSummary | null;
  authorId: string;
  author: MemberSummary | null;
  sourceContentId: string | null;
  sourcePieceId: string | null;
  sourcePieceTitle: string | null;
  media: PublicationMediaData[];
  queuePosition: number | null;
  isPaused: boolean;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastErrorProvider: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  isRetryable: boolean | null;
  checklistState: Record<string, boolean> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

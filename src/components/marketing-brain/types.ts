import type { MarketingBrainBriefing } from "@/lib/marketing-brain/types";

export interface MarketingBrainRunListItem {
  id: string;
  status: string;
  progressPercent: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: { id: string; name: string | null; email: string };
  campaign: { id: string; name: string; status: string } | null;
  briefing: MarketingBrainBriefing;
  stepCount: number;
  resourceCount: number;
}

export interface MarketingBrainStepData {
  id: string;
  key: string;
  status: string;
  order: number;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  errorCategory: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MarketingBrainResourceData {
  id: string;
  type: string;
  action: string;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  pillar: { id: string; name: string } | null;
  piece: { id: string; title: string; platform: string } | null;
  contentItem: { id: string; title: string } | null;
  socialPost: { id: string; platform: string; status: string; internalTitle: string | null } | null;
}

export interface MarketingBrainApprovalData {
  stepKey: string;
  status: string;
  comment: string | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string | null; email: string } | null;
}

export interface MarketingBrainRunDetailData {
  id: string;
  projectId: string;
  status: string;
  currentStepKey: string | null;
  progressPercent: number;
  briefing: MarketingBrainBriefing;
  approvedBriefing: MarketingBrainBriefing | null;
  stagesConfig: { enabled: Record<string, boolean>; approvalGates: string[] };
  campaign: { id: string; name: string; status: string } | null;
  createdBy: { id: string; name: string | null; email: string };
  lastErrorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  steps: MarketingBrainStepData[];
  resources: MarketingBrainResourceData[];
  approvals: MarketingBrainApprovalData[];
}

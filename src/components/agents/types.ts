import type { AgentContextSelection } from "@/lib/agents/types";

export interface AgentRunListItem {
  id: string;
  status: string;
  progressPercent: number;
  createdAt: string;
  officialAgentKey: string | null;
  customAgent: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string };
  stepCount: number;
  resourceCount: number;
}

export interface AgentRunStepData {
  id: string;
  order: number;
  agentRef: string;
  status: string;
  input: { values: Record<string, unknown>; context: AgentContextSelection } | null;
  output: Record<string, unknown> | Record<string, unknown>[] | null;
  errorMessage: string | null;
  errorCategory: string | null;
  attemptCount: number;
  requiresApproval: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentRunResourceData {
  id: string;
  type: string;
  action: string;
  createdAt: string;
  contentItem: { id: string; title: string } | null;
  campaign: { id: string; name: string } | null;
  pillar: { id: string; name: string } | null;
  piece: { id: string; title: string } | null;
  socialPost: { id: string; platform: string; status: string; internalTitle: string | null } | null;
  fileAsset: { id: string; displayName: string | null; originalName: string } | null;
}

export interface AgentRunApprovalData {
  stepOrder: number;
  status: string;
  comment: string | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string | null; email: string } | null;
}

export interface AgentRunDetailData {
  id: string;
  projectId: string;
  status: string;
  currentStepOrder: number | null;
  progressPercent: number;
  officialAgentKey: string | null;
  customAgentId: string | null;
  customAgent: { id: string; name: string; icon: string } | null;
  teamId: string | null;
  team: { id: string; name: string; errorStrategy: string; members: { agentRef: string; order: number; enabled: boolean }[] } | null;
  input: { values: Record<string, unknown>; context: AgentContextSelection };
  approvedInput: { values: Record<string, unknown>; context: AgentContextSelection } | null;
  brandProfile: { id: string; name: string } | null;
  lastErrorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: AgentRunStepData[];
  resources: AgentRunResourceData[];
  approvals: AgentRunApprovalData[];
}

export interface CustomAgentListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  status: string;
  outputType: string;
  createdBy: { id: string; name: string | null; email: string };
}

export interface TeamListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  members: { agentRef: string; order: number; enabled: boolean }[];
}

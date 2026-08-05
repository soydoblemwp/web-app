export interface CampaignDetailData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  objective: string | null;
  audience: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  channels: string[];
  brandProfileId: string | null;
  brandProfileName: string | null;
  valueProposition: string | null;
  mainMessage: string | null;
  offer: string | null;
  primaryCTA: string | null;
  tone: string | null;
  forbiddenWords: string[];
  differentiators: string[];
  audienceLocation: string | null;
  audienceAgeRange: string | null;
  audienceInterests: string[];
  audiencePainPoints: string[];
  audienceNeeds: string[];
  audienceObjections: string[];
  audienceAwareness: string | null;
  contentCount: number | null;
  frequencyPerWeek: number | null;
  preferredDays: string[];
  preferredHours: string[];
  desiredFormats: string[];
}

export interface CampaignPillarData {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  objective: string | null;
  color: string | null;
  percentage: number | null;
  formats: string[];
  platforms: string[];
  topics: string[];
  order: number;
}

export interface CampaignStrategyData {
  id: string;
  summary: string | null;
  audienceProfile: string | null;
  valueProposition: string | null;
  mainMessage: string | null;
  objectives: string[];
  themes: string[];
  creativeAngles: string[];
  cta: string | null;
  risks: string[];
  recommendations: string[];
  suggestedMetrics: string[];
}

export interface MemberSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface CampaignPieceData {
  id: string;
  campaignId: string;
  pillarId: string | null;
  pillar: { id: string; name: string; color: string | null } | null;
  contentItemId: string | null;
  contentItem: { id: string; title: string; status: string } | null;
  title: string;
  idea: string | null;
  platform: string;
  format: string | null;
  objective: string | null;
  cta: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assignee: MemberSummary | null;
  authorId: string;
  author: MemberSummary | null;
  updatedById: string | null;
  updatedBy: MemberSummary | null;
  keywords: string[];
  notes: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  _count: { comments: number };
}

export interface MetricGoalData {
  id: string;
  metricType: string;
  targetValue: number;
  currentValue: number;
  updatedAt: string;
}

export interface ProjectMemberData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

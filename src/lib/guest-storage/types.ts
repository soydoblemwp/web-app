/**
 * Guest-mode data model. Deliberately independent from the Prisma schema —
 * guest data lives only in the browser's IndexedDB and must never be mixed
 * with, or shaped to fit, the server-side models in prisma/schema.prisma.
 */

export interface LocalProject {
  id: string;
  name: string;
  description: string;
  primaryLanguage: string;
  tone: string;
  targetAudience: string;
  market: string;
  createdAt: string;
  updatedAt: string;
}

export type LocalLibraryItemKind =
  | "CONTENT"
  | "SOCIAL_IDEAS"
  | "ADAPTATION"
  | "REPLY"
  | "OTHER";

export interface LocalLibraryItem {
  id: string;
  projectId: string;
  kind: LocalLibraryItemKind;
  title: string;
  body: string;
  isFavorite: boolean;
  /** Soft-delete: kept in storage so it can be restored, filtered out of normal listings. */
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LocalCampaignStatus = "DRAFT" | "PLANNED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export interface LocalCampaign {
  id: string;
  projectId: string;
  name: string;
  description: string;
  objective: string;
  audience: string;
  startDate: string | null;
  endDate: string | null;
  primaryCTA: string;
  status: LocalCampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export type LocalCalendarStatus = "IDEA" | "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export interface LocalCalendarEntry {
  id: string;
  projectId: string;
  campaignId: string | null;
  platform: string;
  text: string;
  scheduledAt: string | null;
  status: LocalCalendarStatus;
  createdAt: string;
  updatedAt: string;
}

export type LocalAutomationTrigger = "MANUAL" | "SCHEDULE_DAILY" | "SCHEDULE_WEEKLY";
export type LocalAutomationAction = "CREATE_REMINDER" | "CHECK_MONITOR";

export interface LocalAutomation {
  id: string;
  projectId: string;
  name: string;
  trigger: LocalAutomationTrigger;
  action: LocalAutomationAction;
  message: string;
  /** For CHECK_MONITOR: which monitor to check. Ignored otherwise. */
  monitorId: string | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAutomationRun {
  id: string;
  automationId: string;
  projectId: string;
  message: string;
  runAt: string;
}

export interface LocalBrandTerm {
  term: string;
  isForbidden: boolean;
}

export interface LocalBrandKit {
  /** One brand kit per project — projectId doubles as the primary key. */
  projectId: string;
  isActiveForAI: boolean;
  name: string;
  tagline: string;
  tone: string;
  personality: string;
  valueProposition: string;
  commonCTAs: string;
  additionalNotes: string;
  terms: LocalBrandTerm[];
  updatedAt: string;
}

export type LocalMonitorStatus = "UNKNOWN" | "OK" | "CHANGED" | "ERROR";

export interface LocalMonitor {
  id: string;
  projectId: string;
  name: string;
  url: string;
  lastSnapshotHash: string | null;
  lastCheckedAt: string | null;
  status: LocalMonitorStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape of the full JSON export produced by src/lib/guest-storage/export.ts. */
export interface GuestDataExport {
  exportedAt: string;
  version: 1;
  projects: LocalProject[];
  library: LocalLibraryItem[];
  campaigns: LocalCampaign[];
  calendarEntries: LocalCalendarEntry[];
  automations: LocalAutomation[];
  automationRuns: LocalAutomationRun[];
  brandKits: LocalBrandKit[];
  monitors: LocalMonitor[];
}

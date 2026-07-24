import { getGuestDB } from "./db";
import type { LocalCalendarEntry, LocalCalendarStatus } from "./types";

export interface SaveCalendarEntryInput {
  projectId: string;
  campaignId?: string | null;
  platform: string;
  text: string;
  scheduledAt?: string | null;
  status?: LocalCalendarStatus;
}

export async function listCalendarEntriesByProject(projectId: string): Promise<LocalCalendarEntry[]> {
  const db = await getGuestDB();
  const entries = await db.getAllFromIndex("calendarEntries", "projectId", projectId);
  return entries.sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function createCalendarEntry(input: SaveCalendarEntryInput): Promise<LocalCalendarEntry> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const entry: LocalCalendarEntry = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    campaignId: input.campaignId ?? null,
    platform: input.platform,
    text: input.text,
    scheduledAt: input.scheduledAt ?? null,
    status: input.status ?? "IDEA",
    createdAt: now,
    updatedAt: now,
  };
  await db.put("calendarEntries", entry);
  return entry;
}

export async function updateCalendarEntry(
  id: string,
  patch: Partial<Omit<LocalCalendarEntry, "id" | "projectId" | "createdAt">>
): Promise<LocalCalendarEntry | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("calendarEntries", id);
  if (!existing) return undefined;
  const updated: LocalCalendarEntry = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.put("calendarEntries", updated);
  return updated;
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  const db = await getGuestDB();
  await db.delete("calendarEntries", id);
}

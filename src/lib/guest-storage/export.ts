import { getGuestDB, clearAllGuestData } from "./db";
import type { GuestDataExport } from "./types";

/** Reads every guest object store and composes the full exportable snapshot. */
export async function buildGuestDataExport(): Promise<GuestDataExport> {
  const db = await getGuestDB();
  const [projects, library, campaigns, calendarEntries, automations, automationRuns, brandKits, monitors] =
    await Promise.all([
      db.getAll("projects"),
      db.getAll("library"),
      db.getAll("campaigns"),
      db.getAll("calendarEntries"),
      db.getAll("automations"),
      db.getAll("automationRuns"),
      db.getAll("brandKits"),
      db.getAll("monitors"),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    projects,
    library,
    campaigns,
    calendarEntries,
    automations,
    automationRuns,
    brandKits,
    monitors,
  };
}

/** Triggers a browser download of the full guest data as a JSON file. Nothing is sent anywhere. */
export async function downloadGuestDataExport(): Promise<void> {
  const data = await buildGuestDataExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-content-hub-datos-locales-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Irreversibly deletes every guest object store. */
export async function deleteAllGuestData(): Promise<void> {
  await clearAllGuestData();
}

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  LocalAutomation,
  LocalAutomationRun,
  LocalBrandKit,
  LocalCalendarEntry,
  LocalCampaign,
  LocalLibraryItem,
  LocalMonitor,
  LocalProject,
} from "./types";

const DB_NAME = "ai-content-hub-guest";
const DB_VERSION = 1;

export interface GuestDB extends DBSchema {
  projects: { key: string; value: LocalProject; indexes: { updatedAt: string } };
  library: {
    key: string;
    value: LocalLibraryItem;
    indexes: { projectId: string; updatedAt: string };
  };
  campaigns: { key: string; value: LocalCampaign; indexes: { projectId: string } };
  calendarEntries: { key: string; value: LocalCalendarEntry; indexes: { projectId: string } };
  automations: { key: string; value: LocalAutomation; indexes: { projectId: string } };
  automationRuns: { key: string; value: LocalAutomationRun; indexes: { automationId: string } };
  brandKits: { key: string; value: LocalBrandKit };
  monitors: { key: string; value: LocalMonitor; indexes: { projectId: string } };
}

let dbPromise: Promise<IDBPDatabase<GuestDB>> | null = null;

/** Guest data never touches Neon/Prisma — this is the only storage backend for guest mode. */
export function getGuestDB(): Promise<IDBPDatabase<GuestDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB no está disponible en este navegador.");
  }

  if (!dbPromise) {
    dbPromise = openDB<GuestDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");

        const library = db.createObjectStore("library", { keyPath: "id" });
        library.createIndex("projectId", "projectId");
        library.createIndex("updatedAt", "updatedAt");

        db.createObjectStore("campaigns", { keyPath: "id" }).createIndex("projectId", "projectId");
        db.createObjectStore("calendarEntries", { keyPath: "id" }).createIndex("projectId", "projectId");
        db.createObjectStore("automations", { keyPath: "id" }).createIndex("projectId", "projectId");
        db.createObjectStore("automationRuns", { keyPath: "id" }).createIndex("automationId", "automationId");
        db.createObjectStore("brandKits", { keyPath: "projectId" });
        db.createObjectStore("monitors", { keyPath: "id" }).createIndex("projectId", "projectId");
      },
    });
  }

  return dbPromise;
}

/** Wipes every guest object store. Used by the "delete all local data" flow — irreversible. */
export async function clearAllGuestData(): Promise<void> {
  const db = await getGuestDB();
  const storeNames = Array.from(db.objectStoreNames);
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([...storeNames.map((name) => tx.objectStore(name).clear()), tx.done]);
}

/** Only for tests: closes the current connection (if any) and forces the next getGuestDB() call to reopen the database. */
export async function _resetGuestDBForTests(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    const db = await pending;
    db.close();
  }
}

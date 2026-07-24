import { getGuestDB } from "./db";
import type { LocalProject } from "./types";

export interface CreateLocalProjectInput {
  name: string;
  description?: string;
  primaryLanguage?: string;
  tone?: string;
  targetAudience?: string;
  market?: string;
}

export async function listLocalProjects(): Promise<LocalProject[]> {
  const db = await getGuestDB();
  const projects = await db.getAllFromIndex("projects", "updatedAt");
  return projects.reverse();
}

export async function getLocalProject(id: string): Promise<LocalProject | undefined> {
  const db = await getGuestDB();
  return db.get("projects", id);
}

export async function createLocalProject(input: CreateLocalProjectInput): Promise<LocalProject> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const project: LocalProject = {
    id: crypto.randomUUID(),
    name: input.name.trim().slice(0, 200) || "Proyecto sin nombre",
    description: input.description?.trim() ?? "",
    primaryLanguage: input.primaryLanguage?.trim() || "es",
    tone: input.tone?.trim() ?? "",
    targetAudience: input.targetAudience?.trim() ?? "",
    market: input.market?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await db.put("projects", project);
  return project;
}

export async function updateLocalProject(
  id: string,
  patch: Partial<Omit<LocalProject, "id" | "createdAt">>
): Promise<LocalProject | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("projects", id);
  if (!existing) return undefined;
  const updated: LocalProject = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
  await db.put("projects", updated);
  return updated;
}

export async function renameLocalProject(id: string, name: string): Promise<LocalProject | undefined> {
  return updateLocalProject(id, { name: name.trim().slice(0, 200) || "Proyecto sin nombre" });
}

/** Deletes the project and everything scoped to it (library items, campaigns, calendar, automations, brand kit, monitors). */
export async function deleteLocalProject(id: string): Promise<void> {
  const db = await getGuestDB();
  const scopedStores = ["library", "campaigns", "calendarEntries", "automations", "monitors"] as const;

  const tx = db.transaction([...scopedStores, "brandKits", "projects"], "readwrite");
  await Promise.all([
    ...scopedStores.map(async (storeName) => {
      const store = tx.objectStore(storeName);
      const index = store.index("projectId");
      let cursor = await index.openCursor(IDBKeyRange.only(id));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
    }),
    tx.objectStore("brandKits").delete(id),
    tx.objectStore("projects").delete(id),
    tx.done,
  ]);
}

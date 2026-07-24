import { getGuestDB } from "./db";
import type { LocalLibraryItem, LocalLibraryItemKind } from "./types";

export interface SaveLibraryItemInput {
  projectId: string;
  kind: LocalLibraryItemKind;
  title: string;
  body: string;
}

export async function saveLibraryItem(input: SaveLibraryItemInput): Promise<LocalLibraryItem> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const item: LocalLibraryItem = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    kind: input.kind,
    title: input.title.trim().slice(0, 200) || "Sin título",
    body: input.body,
    isFavorite: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("library", item);
  return item;
}

export async function listLibraryItemsByProject(
  projectId: string,
  options: { includeDeleted?: boolean } = {}
): Promise<LocalLibraryItem[]> {
  const db = await getGuestDB();
  const items = await db.getAllFromIndex("library", "projectId", projectId);
  const visible = options.includeDeleted ? items : items.filter((item) => !item.isDeleted);
  return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAllLibraryItems(options: { includeDeleted?: boolean } = {}): Promise<LocalLibraryItem[]> {
  const db = await getGuestDB();
  const items = await db.getAll("library");
  const visible = options.includeDeleted ? items : items.filter((item) => !item.isDeleted);
  return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateLibraryItem(
  id: string,
  patch: Partial<Pick<LocalLibraryItem, "title" | "body">>
): Promise<LocalLibraryItem | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("library", id);
  if (!existing) return undefined;
  const updated: LocalLibraryItem = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await db.put("library", updated);
  return updated;
}

export async function toggleLibraryItemFavorite(id: string): Promise<LocalLibraryItem | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("library", id);
  if (!existing) return undefined;
  const updated: LocalLibraryItem = {
    ...existing,
    isFavorite: !existing.isFavorite,
    updatedAt: new Date().toISOString(),
  };
  await db.put("library", updated);
  return updated;
}

export async function duplicateLibraryItem(id: string): Promise<LocalLibraryItem | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("library", id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const copy: LocalLibraryItem = {
    ...existing,
    id: crypto.randomUUID(),
    title: `${existing.title} (copia)`,
    isFavorite: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("library", copy);
  return copy;
}

/** Soft-delete: moves the item to trash so it can be restored later. */
export async function softDeleteLibraryItem(id: string): Promise<void> {
  const db = await getGuestDB();
  const existing = await db.get("library", id);
  if (!existing) return;
  await db.put("library", { ...existing, isDeleted: true, updatedAt: new Date().toISOString() });
}

export async function restoreLibraryItem(id: string): Promise<LocalLibraryItem | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("library", id);
  if (!existing) return undefined;
  const restored: LocalLibraryItem = { ...existing, isDeleted: false, updatedAt: new Date().toISOString() };
  await db.put("library", restored);
  return restored;
}

/** Permanently removes an item — only meaningful from the trash view. */
export async function permanentlyDeleteLibraryItem(id: string): Promise<void> {
  const db = await getGuestDB();
  await db.delete("library", id);
}

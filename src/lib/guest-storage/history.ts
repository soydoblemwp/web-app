import { listAllLibraryItems } from "./library";
import type { LocalLibraryItem } from "./types";

/**
 * Read-oriented view over the library store: a single reverse-chronological
 * feed across every local project, for the "Historial" nav page. All
 * mutation (edit, favorite, delete, restore) lives in library.ts — history
 * is intentionally just a different lens on the same data.
 */
export async function listRecentHistory(limit = 50): Promise<LocalLibraryItem[]> {
  const items = await listAllLibraryItems();
  return items.slice(0, limit);
}

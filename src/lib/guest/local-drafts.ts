/**
 * Guest-mode draft persistence. Runs entirely in the browser — nothing here
 * ever reaches Neon or any server. This is intentionally the only place
 * guest-generated content is kept, and only for as long as the browser
 * keeps localStorage for this origin (cleared cache/storage removes it).
 */

export type GuestTool = "content" | "ideas" | "adapter" | "replies";

export interface GuestDraft {
  id: string;
  tool: GuestTool;
  title: string;
  content: string;
  createdAt: string;
}

const STORAGE_KEY = "ai-content-hub:guest-drafts";
const MAX_DRAFTS = 20;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadGuestDrafts(tool?: GuestTool): GuestDraft[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuestDraft[];
    if (!Array.isArray(parsed)) return [];
    return tool ? parsed.filter((d) => d.tool === tool) : parsed;
  } catch {
    return [];
  }
}

export function saveGuestDraft(draft: { tool: GuestTool; title: string; content: string }): GuestDraft[] {
  if (!isBrowser()) return [];
  const all = loadGuestDrafts();
  const entry: GuestDraft = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool: draft.tool,
    title: draft.title.slice(0, 120),
    content: draft.content,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...all].slice(0, MAX_DRAFTS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable (private browsing) — the draft still
    // displays in the current page; it just won't survive a reload.
  }
  return next.filter((d) => d.tool === draft.tool);
}

export function deleteGuestDraft(id: string): GuestDraft[] {
  if (!isBrowser()) return [];
  const all = loadGuestDrafts();
  const next = all.filter((d) => d.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

import { getGuestDB } from "./db";
import type { LocalMonitor } from "./types";

export interface CreateMonitorInput {
  projectId: string;
  name: string;
  url: string;
}

export async function listMonitorsByProject(projectId: string): Promise<LocalMonitor[]> {
  const db = await getGuestDB();
  const monitors = await db.getAllFromIndex("monitors", "projectId", projectId);
  return monitors.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createMonitor(input: CreateMonitorInput): Promise<LocalMonitor> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const monitor: LocalMonitor = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: input.name.trim().slice(0, 200) || input.url,
    url: input.url.trim(),
    lastSnapshotHash: null,
    lastCheckedAt: null,
    status: "UNKNOWN",
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("monitors", monitor);
  return monitor;
}

export async function deleteMonitor(id: string): Promise<void> {
  const db = await getGuestDB();
  await db.delete("monitors", id);
}

async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Best-effort, fully client-side check: fetches the target URL directly from
 * the browser and diffs its text against the last saved snapshot. No
 * server, no proxy — which means it only works for same-origin URLs or
 * URLs whose server opts in via CORS; cross-origin sites that don't will
 * fail with a clear error rather than silently pretending to work.
 */
export async function checkMonitorNow(id: string): Promise<LocalMonitor | undefined> {
  const db = await getGuestDB();
  const monitor = await db.get("monitors", id);
  if (!monitor) return undefined;

  const now = new Date().toISOString();
  let updated: LocalMonitor;

  try {
    const response = await fetch(monitor.url, { method: "GET" });
    if (!response.ok) throw new Error(`El sitio respondió con estado ${response.status}.`);
    const text = await response.text();
    const hash = await hashText(text);
    const changed = monitor.lastSnapshotHash !== null && monitor.lastSnapshotHash !== hash;
    updated = {
      ...monitor,
      lastSnapshotHash: hash,
      lastCheckedAt: now,
      status: changed ? "CHANGED" : "OK",
      lastError: null,
      updatedAt: now,
    };
  } catch (error) {
    updated = {
      ...monitor,
      lastCheckedAt: now,
      status: "ERROR",
      lastError:
        error instanceof Error
          ? `${error.message} (posiblemente bloqueado por CORS: el navegador no puede leer sitios que no lo permitan explícitamente)`
          : "No se pudo comprobar el sitio.",
      updatedAt: now,
    };
  }

  await db.put("monitors", updated);
  return updated;
}

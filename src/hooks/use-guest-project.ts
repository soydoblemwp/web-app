"use client";

import { useCallback, useEffect, useState } from "react";
import { createLocalProject, listLocalProjects } from "@/lib/guest-storage/projects";
import type { LocalProject } from "@/lib/guest-storage/types";

const SELECTED_PROJECT_KEY = "ai-content-hub:guest-selected-project";

function readSelectedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_KEY);
  } catch {
    return null;
  }
}

function writeSelectedId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(SELECTED_PROJECT_KEY, id);
    else window.localStorage.removeItem(SELECTED_PROJECT_KEY);
  } catch {
    // Storage unavailable (private browsing) — selection just won't persist across reloads.
  }
}

/**
 * Tracks which local project is "active" across every guest page. Only the
 * selected project *id* lives outside IndexedDB (a single string in
 * localStorage is negligible — the actual project data never does).
 */
export function useGuestProject() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await listLocalProjects();
    setProjects(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refresh();
      if (cancelled) return;
      const stored = readSelectedId();
      const validStored = stored && list.some((p) => p.id === stored) ? stored : null;
      setSelectedId(validStored ?? list[0]?.id ?? null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const selectProject = useCallback((id: string) => {
    setSelectedId(id);
    writeSelectedId(id);
  }, []);

  /** Returns the active project id, auto-creating a default "General" project the first time it's needed. */
  const ensureProjectId = useCallback(async (): Promise<string> => {
    if (selectedId) return selectedId;
    const list = await refresh();
    if (list[0]) {
      selectProject(list[0].id);
      return list[0].id;
    }
    const created = await createLocalProject({ name: "General" });
    await refresh();
    selectProject(created.id);
    return created.id;
  }, [selectedId, refresh, selectProject]);

  return {
    projects,
    selectedId,
    selectedProject: projects.find((p) => p.id === selectedId) ?? null,
    selectProject,
    refresh,
    ensureProjectId,
    isLoading,
  };
}

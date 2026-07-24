import { beforeEach, describe, expect, it } from "vitest";
import { _resetGuestDBForTests, clearAllGuestData, getGuestDB } from "@/lib/guest-storage/db";
import {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  renameLocalProject,
} from "@/lib/guest-storage/projects";
import {
  duplicateLibraryItem,
  listLibraryItemsByProject,
  permanentlyDeleteLibraryItem,
  restoreLibraryItem,
  saveLibraryItem,
  softDeleteLibraryItem,
  toggleLibraryItemFavorite,
  updateLibraryItem,
} from "@/lib/guest-storage/library";
import { listRecentHistory } from "@/lib/guest-storage/history";
import { createCampaign, listCampaignsByProject } from "@/lib/guest-storage/campaigns";
import { createCalendarEntry, listCalendarEntriesByProject } from "@/lib/guest-storage/calendar";
import { getLocalBrandKit, saveLocalBrandKit } from "@/lib/guest-storage/brand-kit";
import { buildGuestDataExport, deleteAllGuestData } from "@/lib/guest-storage/export";

async function resetDB() {
  await _resetGuestDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("ai-content-hub-guest");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await resetDB();
});

describe("local projects", () => {
  it("creates a project with a browser-generated UUID", async () => {
    const project = await createLocalProject({ name: "Mi marca" });
    expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(project.name).toBe("Mi marca");
  });

  it("lists, renames and deletes projects", async () => {
    const project = await createLocalProject({ name: "Original" });
    await renameLocalProject(project.id, "Renombrado");

    const listed = await listLocalProjects();
    expect(listed.find((p) => p.id === project.id)?.name).toBe("Renombrado");

    await deleteLocalProject(project.id);
    expect(await listLocalProjects()).toHaveLength(0);
  });

  it("deleting a project also deletes its scoped library items, campaigns and calendar entries", async () => {
    const project = await createLocalProject({ name: "Con datos" });
    await saveLibraryItem({ projectId: project.id, kind: "CONTENT", title: "T", body: "B" });
    await createCampaign({ projectId: project.id, name: "Campaña" });
    await createCalendarEntry({ projectId: project.id, platform: "Instagram", text: "Post" });

    await deleteLocalProject(project.id);

    expect(await listLibraryItemsByProject(project.id, { includeDeleted: true })).toHaveLength(0);
    expect(await listCampaignsByProject(project.id)).toHaveLength(0);
    expect(await listCalendarEntriesByProject(project.id)).toHaveLength(0);
  });
});

describe("data survives reopening the database (simulating browser close/reopen)", () => {
  it("keeps project data after the IndexedDB connection is reset and reopened", async () => {
    const project = await createLocalProject({ name: "Persistente" });
    await saveLibraryItem({ projectId: project.id, kind: "CONTENT", title: "Sobrevive", body: "..." });

    // Simulate closing and reopening the browser: drop the in-memory
    // connection cache, force a fresh openDB() call against the same
    // physical IndexedDB database.
    await _resetGuestDBForTests();

    const projects = await listLocalProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Persistente");

    const items = await listLibraryItemsByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Sobrevive");
  });
});

describe("local library (Historial y Biblioteca)", () => {
  it("saves, edits, duplicates, favorites, soft-deletes and restores an item", async () => {
    const project = await createLocalProject({ name: "P" });
    const item = await saveLibraryItem({ projectId: project.id, kind: "CONTENT", title: "Original", body: "Cuerpo" });

    const edited = await updateLibraryItem(item.id, { title: "Editado" });
    expect(edited?.title).toBe("Editado");

    const favorited = await toggleLibraryItemFavorite(item.id);
    expect(favorited?.isFavorite).toBe(true);

    const duplicate = await duplicateLibraryItem(item.id);
    expect(duplicate?.id).not.toBe(item.id);
    expect(duplicate?.title).toContain("copia");

    await softDeleteLibraryItem(item.id);
    let visible = await listLibraryItemsByProject(project.id);
    expect(visible.find((i) => i.id === item.id)).toBeUndefined();

    const restored = await restoreLibraryItem(item.id);
    expect(restored?.isDeleted).toBe(false);
    visible = await listLibraryItemsByProject(project.id);
    expect(visible.find((i) => i.id === item.id)).toBeDefined();

    await permanentlyDeleteLibraryItem(item.id);
    const all = await listLibraryItemsByProject(project.id, { includeDeleted: true });
    expect(all.find((i) => i.id === item.id)).toBeUndefined();
  });

  it("organizes items by local project", async () => {
    const projectA = await createLocalProject({ name: "A" });
    const projectB = await createLocalProject({ name: "B" });
    await saveLibraryItem({ projectId: projectA.id, kind: "CONTENT", title: "A1", body: "" });
    await saveLibraryItem({ projectId: projectB.id, kind: "CONTENT", title: "B1", body: "" });

    expect(await listLibraryItemsByProject(projectA.id)).toHaveLength(1);
    expect(await listLibraryItemsByProject(projectB.id)).toHaveLength(1);
  });

  it("history lists items across all projects, most recent first", async () => {
    const projectA = await createLocalProject({ name: "A" });
    const projectB = await createLocalProject({ name: "B" });
    await saveLibraryItem({ projectId: projectA.id, kind: "CONTENT", title: "Primero", body: "" });
    // Guarantee a distinct, later timestamp — two saves in the same
    // millisecond would otherwise tie on the sort key this assertion checks.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveLibraryItem({ projectId: projectB.id, kind: "REPLY", title: "Segundo", body: "" });

    const history = await listRecentHistory();
    expect(history.map((i) => i.title)).toEqual(["Segundo", "Primero"]);
  });
});

describe("local campaigns", () => {
  it("creates campaigns scoped to a project", async () => {
    const project = await createLocalProject({ name: "P" });
    await createCampaign({ projectId: project.id, name: "Lanzamiento" });
    const campaigns = await listCampaignsByProject(project.id);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].name).toBe("Lanzamiento");
    expect(campaigns[0].status).toBe("DRAFT");
  });
});

describe("local calendar", () => {
  it("creates scheduled entries scoped to a project", async () => {
    const project = await createLocalProject({ name: "P" });
    await createCalendarEntry({
      projectId: project.id,
      platform: "Instagram",
      text: "Publicación",
      scheduledAt: new Date().toISOString(),
      status: "SCHEDULED",
    });
    const entries = await listCalendarEntriesByProject(project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("SCHEDULED");
  });
});

describe("local brand kit", () => {
  it("saves and retrieves brand configuration used by the local AI prompts", async () => {
    const project = await createLocalProject({ name: "P" });
    await saveLocalBrandKit({
      projectId: project.id,
      name: "Mi Marca",
      tone: "Cercano",
      terms: [{ term: "innovador", isForbidden: false }, { term: "barato", isForbidden: true }],
    });

    const brandKit = await getLocalBrandKit(project.id);
    expect(brandKit?.name).toBe("Mi Marca");
    expect(brandKit?.terms).toHaveLength(2);
  });
});

describe("export and delete", () => {
  it("exports every store into a single JSON-serializable snapshot", async () => {
    const project = await createLocalProject({ name: "P" });
    await saveLibraryItem({ projectId: project.id, kind: "CONTENT", title: "T", body: "B" });
    await createCampaign({ projectId: project.id, name: "C" });

    const snapshot = await buildGuestDataExport();
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.library).toHaveLength(1);
    expect(snapshot.campaigns).toHaveLength(1);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("deletes every store completely and irreversibly", async () => {
    const project = await createLocalProject({ name: "P" });
    await saveLibraryItem({ projectId: project.id, kind: "CONTENT", title: "T", body: "B" });
    await createCampaign({ projectId: project.id, name: "C" });

    await deleteAllGuestData();

    const db = await getGuestDB();
    expect(await db.getAll("projects")).toHaveLength(0);
    expect(await db.getAll("library")).toHaveLength(0);
    expect(await db.getAll("campaigns")).toHaveLength(0);
  });

  it("clearAllGuestData is exposed directly from db.ts as the single source of truth for wiping data", () => {
    expect(typeof clearAllGuestData).toBe("function");
  });
});

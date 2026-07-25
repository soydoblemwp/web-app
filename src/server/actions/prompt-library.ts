"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createSavedPromptSchema, updateSavedPromptSchema } from "@/lib/validation/prompt-library";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { findAiTool } from "@/lib/ai-center/registry";
import { listSavedPromptsForUser } from "@/server/services/prompt-library";

export interface SavedPromptActionState {
  error?: string;
  /** The real, server-created/duplicated SavedPrompt id — the UI must use this, never a client-guessed value. */
  id?: string;
}

function promptLibraryPath(projectId: string) {
  return `/dashboard/${projectId}/prompt-library`;
}

/**
 * Read-only fetch for client components that need the user's saved prompts
 * without a Server Component round-trip — e.g. the AI Workflows step editor
 * ("Usar Prompt Library" steps). Reuses listSavedPromptsForUser (never a
 * second query), same pattern as listBrandProfilesForSelectAction.
 */
export async function listSavedPromptsForSelectAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listSavedPromptsForUser(user.id, projectId);
}

/**
 * Loads the target prompt and verifies it belongs to `userId` — the one
 * check every mutation below runs before touching a row. Returns null for
 * both "doesn't exist" and "belongs to someone else", so a caller can never
 * distinguish the two (no cross-user existence leak).
 */
async function getOwnedPrompt(id: string, userId: string) {
  const prompt = await prisma.savedPrompt.findUnique({ where: { id } });
  if (!prompt || prompt.userId !== userId) return null;
  return prompt;
}

export interface CreateSavedPromptInput {
  /** The project the Prompt Library page is currently open in — always access-checked, regardless of `scope`. */
  projectId: string;
  /** "project" scopes the saved prompt to `projectId`; "global" makes it usable from every project this user has. */
  scope: "project" | "global";
  title: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  sourceTool?: string;
  useBrandKit?: boolean;
}

export async function createSavedPromptAction(input: CreateSavedPromptInput): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const parsed = createSavedPromptSchema.safeParse({
    projectId: input.scope === "project" ? input.projectId : null,
    title: input.title,
    description: input.description,
    content: input.content,
    category: input.category,
    tags: input.tags ?? [],
    sourceTool: input.sourceTool,
    useBrandKit: input.useBrandKit ?? false,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const created = await prisma.savedPrompt.create({
    data: {
      userId: user.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content,
      category: parsed.data.category || null,
      tags: parsed.data.tags,
      sourceTool: parsed.data.sourceTool || null,
      useBrandKit: parsed.data.useBrandKit,
    },
  });

  revalidatePath(promptLibraryPath(input.projectId));
  return { id: created.id };
}

/**
 * Save-from-tool: the "Guardar Prompt" affordance every AI Center tool gets
 * via AiGenerationForm. `toolSlug` is validated against the real tool
 * registry the same way saveAiToolResultAction validates it — an
 * unrecognized slug fails lookup instead of writing anything arbitrary. When
 * no category is supplied, it defaults to the tool's own AI Center category
 * label, resolved server-side (never trusted from the client).
 */
export interface SaveGeneratedPromptInput {
  projectId: string;
  toolSlug: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  useBrandKit?: boolean;
}

export async function saveGeneratedPromptAction(input: SaveGeneratedPromptInput): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const tool = findToolDefinition(input.toolSlug);
  if (!tool) return { error: "Herramienta no reconocida." };

  const parsed = createSavedPromptSchema.safeParse({
    projectId: input.projectId,
    title: input.title,
    content: input.content,
    category: input.category || findAiTool(input.toolSlug)?.categoryLabel || "",
    tags: input.tags ?? [],
    sourceTool: tool.slug,
    useBrandKit: input.useBrandKit ?? false,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const created = await prisma.savedPrompt.create({
    data: {
      userId: user.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content,
      category: parsed.data.category || null,
      tags: parsed.data.tags,
      sourceTool: parsed.data.sourceTool || null,
      useBrandKit: parsed.data.useBrandKit,
    },
  });

  revalidatePath(promptLibraryPath(input.projectId));
  return { id: created.id };
}

export async function updateSavedPromptAction(
  projectId: string,
  id: string,
  input: { title?: string; description?: string; content?: string; category?: string; tags?: string[]; useBrandKit?: boolean }
): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedPrompt(id, user.id);
  if (!existing) return { error: "Prompt no encontrado." };

  const parsed = updateSavedPromptSchema.safeParse({ id, ...input });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  await prisma.savedPrompt.update({
    where: { id },
    data: {
      title: parsed.data.title ?? existing.title,
      description: parsed.data.description !== undefined ? parsed.data.description || null : existing.description,
      content: parsed.data.content ?? existing.content,
      category: parsed.data.category !== undefined ? parsed.data.category || null : existing.category,
      tags: parsed.data.tags ?? existing.tags,
      useBrandKit: parsed.data.useBrandKit ?? existing.useBrandKit,
    },
  });

  revalidatePath(promptLibraryPath(projectId));
  return { id };
}

export async function deleteSavedPromptAction(projectId: string, id: string): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedPrompt(id, user.id);
  if (!existing) return { error: "Prompt no encontrado." };

  await prisma.savedPrompt.delete({ where: { id } });

  revalidatePath(promptLibraryPath(projectId));
  return {};
}

export async function duplicateSavedPromptAction(projectId: string, id: string): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedPrompt(id, user.id);
  if (!existing) return { error: "Prompt no encontrado." };

  const copy = await prisma.savedPrompt.create({
    data: {
      userId: user.id,
      projectId: existing.projectId,
      title: `${existing.title} (copia)`,
      description: existing.description,
      content: existing.content,
      category: existing.category,
      tags: existing.tags,
      sourceTool: existing.sourceTool,
      useBrandKit: existing.useBrandKit,
    },
  });

  revalidatePath(promptLibraryPath(projectId));
  return { id: copy.id };
}

export async function toggleFavoriteSavedPromptAction(
  projectId: string,
  id: string,
  next: boolean
): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedPrompt(id, user.id);
  if (!existing) return { error: "Prompt no encontrado." };

  await prisma.savedPrompt.update({ where: { id }, data: { isFavorite: next } });

  revalidatePath(promptLibraryPath(projectId));
  return {};
}

/** Bumps the usage history (useCount/lastUsedAt) — called whenever the user reuses a saved prompt, from the Prompt Library or Chat IA. */
export async function recordPromptUseAction(projectId: string, id: string): Promise<SavedPromptActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedPrompt(id, user.id);
  if (!existing) return { error: "Prompt no encontrado." };

  await prisma.savedPrompt.update({
    where: { id },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });

  revalidatePath(promptLibraryPath(projectId));
  return {};
}

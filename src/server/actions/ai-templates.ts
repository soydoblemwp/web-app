"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createAiTemplateSchema, updateAiTemplateSchema } from "@/lib/validation/ai-templates";
import { extractTemplateVariables } from "@/lib/ai-templates/engine";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { findAiTool } from "@/lib/ai-center/registry";
import { listAiTemplatesForUser } from "@/server/services/ai-templates";

export interface AiTemplateActionState {
  error?: string;
  /** The real, server-created/duplicated AiTemplate id — the UI must use this, never a client-guessed value. */
  id?: string;
}

function aiTemplatesPath(projectId: string) {
  return `/dashboard/${projectId}/ai-templates`;
}

/**
 * Read-only fetch for client components that need the user's AI Templates
 * without a Server Component round-trip — e.g. the AI Workflows step editor
 * ("Usar AI Template" steps). Reuses listAiTemplatesForUser (never a second
 * query), same pattern as listBrandProfilesForSelectAction.
 */
export async function listAiTemplatesForSelectAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listAiTemplatesForUser(user.id, projectId);
}

/**
 * Loads the target template and verifies it belongs to `userId` — the one
 * check every mutation below runs before touching a row. Returns null for
 * both "doesn't exist" and "belongs to someone else" (no cross-user
 * existence leak) — same shape as getOwnedPrompt in
 * src/server/actions/prompt-library.ts.
 */
async function getOwnedTemplate(id: string, userId: string) {
  const template = await prisma.aiTemplate.findUnique({ where: { id } });
  if (!template || template.userId !== userId) return null;
  return template;
}

export interface CreateAiTemplateInput {
  /** The project the AI Templates page is currently open in — always access-checked, regardless of `scope`. */
  projectId: string;
  /** "project" scopes the template to `projectId`; "global" makes it usable from every project this user has. */
  scope: "project" | "global";
  title: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  sourceTool?: string;
}

export async function createAiTemplateAction(input: CreateAiTemplateInput): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const parsed = createAiTemplateSchema.safeParse({
    projectId: input.scope === "project" ? input.projectId : null,
    title: input.title,
    description: input.description,
    content: input.content,
    category: input.category,
    tags: input.tags ?? [],
    sourceTool: input.sourceTool,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const created = await prisma.aiTemplate.create({
    data: {
      userId: user.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content,
      // Always derived server-side from the real content — never trusted from the client.
      variables: extractTemplateVariables(parsed.data.content),
      category: parsed.data.category || null,
      tags: parsed.data.tags,
      sourceTool: parsed.data.sourceTool || null,
    },
  });

  revalidatePath(aiTemplatesPath(input.projectId));
  return { id: created.id };
}

export interface SaveGeneratedAsTemplateInput {
  projectId: string;
  toolSlug: string;
  title: string;
  /** The generated RESULT text — a Template stores reusable output structure, unlike Prompt Library's saveGeneratedPromptAction, which stores the input prompt. */
  content: string;
  category?: string;
  tags?: string[];
}

/**
 * "Guardar como Template": the button AiGenerationForm gets for every AI
 * Center tool. `toolSlug` is validated against the real tool registry
 * exactly like saveAiToolResultAction/saveGeneratedPromptAction do — an
 * unrecognized slug fails lookup instead of writing anything arbitrary.
 */
export async function saveGeneratedAsTemplateAction(input: SaveGeneratedAsTemplateInput): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const tool = findToolDefinition(input.toolSlug);
  if (!tool) return { error: "Herramienta no reconocida." };

  const parsed = createAiTemplateSchema.safeParse({
    projectId: input.projectId,
    title: input.title,
    content: input.content,
    category: input.category || findAiTool(input.toolSlug)?.categoryLabel || "",
    tags: input.tags ?? [],
    sourceTool: tool.slug,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const created = await prisma.aiTemplate.create({
    data: {
      userId: user.id,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content,
      variables: extractTemplateVariables(parsed.data.content),
      category: parsed.data.category || null,
      tags: parsed.data.tags,
      sourceTool: parsed.data.sourceTool || null,
    },
  });

  revalidatePath(aiTemplatesPath(input.projectId));
  return { id: created.id };
}

export async function updateAiTemplateAction(
  projectId: string,
  id: string,
  input: { title?: string; description?: string; content?: string; category?: string; tags?: string[] }
): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedTemplate(id, user.id);
  if (!existing) return { error: "Template no encontrado." };

  const parsed = updateAiTemplateSchema.safeParse({ id, ...input });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const nextContent = parsed.data.content ?? existing.content;

  await prisma.aiTemplate.update({
    where: { id },
    data: {
      title: parsed.data.title ?? existing.title,
      description: parsed.data.description !== undefined ? parsed.data.description || null : existing.description,
      content: nextContent,
      variables: extractTemplateVariables(nextContent),
      category: parsed.data.category !== undefined ? parsed.data.category || null : existing.category,
      tags: parsed.data.tags ?? existing.tags,
    },
  });

  revalidatePath(aiTemplatesPath(projectId));
  return { id };
}

export async function deleteAiTemplateAction(projectId: string, id: string): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedTemplate(id, user.id);
  if (!existing) return { error: "Template no encontrado." };

  await prisma.aiTemplate.delete({ where: { id } });

  revalidatePath(aiTemplatesPath(projectId));
  return {};
}

export async function duplicateAiTemplateAction(projectId: string, id: string): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedTemplate(id, user.id);
  if (!existing) return { error: "Template no encontrado." };

  const copy = await prisma.aiTemplate.create({
    data: {
      userId: user.id,
      projectId: existing.projectId,
      title: `${existing.title} (copia)`,
      description: existing.description,
      content: existing.content,
      variables: existing.variables,
      category: existing.category,
      tags: existing.tags,
      sourceTool: existing.sourceTool,
    },
  });

  revalidatePath(aiTemplatesPath(projectId));
  return { id: copy.id };
}

export async function toggleFavoriteAiTemplateAction(
  projectId: string,
  id: string,
  next: boolean
): Promise<AiTemplateActionState> {
  const user = await requireProjectAccess(projectId, "VIEWER");

  const existing = await getOwnedTemplate(id, user.id);
  if (!existing) return { error: "Template no encontrado." };

  await prisma.aiTemplate.update({ where: { id }, data: { isFavorite: next } });

  revalidatePath(aiTemplatesPath(projectId));
  return {};
}

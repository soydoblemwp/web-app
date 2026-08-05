"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { updateContentItemSchema, updateContentMetadataSchema } from "@/lib/validation/content";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";
import type { ContentType } from "@/generated/prisma/enums";
import { publishAutomationEvent } from "@/server/services/automation-events";

export interface SaveGeneratedContentInput {
  projectId: string;
  type: ContentType;
  topic: string;
  body: string;
  language: string;
  audience?: string;
  tone?: string;
  keywords?: string;
  cta?: string;
}

export interface SaveGeneratedContentState {
  error?: string;
}

/**
 * Persists a piece of content the browser already generated locally (see
 * src/lib/ai/local). No AI runs here — this action only ever receives the
 * final text, never a prompt, and never talks to any AI provider.
 */
export async function saveGeneratedContentAction(
  input: SaveGeneratedContentInput
): Promise<SaveGeneratedContentState | never> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.topic.trim()) return { error: "Describe el tema del contenido." };
  if (!input.body.trim()) return { error: "No hay contenido generado que guardar." };

  const title = input.topic.slice(0, 120);
  const contentItem = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: input.type,
      title,
      body: input.body,
      language: input.language,
      targetAudience: input.audience || null,
      tone: input.tone || null,
      keywords: input.keywords ? input.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      cta: input.cta || null,
      sourceTool: "generador-contenido",
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  await publishAutomationEvent({
    projectId: input.projectId,
    eventKey: "content_item.created",
    resourceId: contentItem.id,
    actorId: user.id,
    payload: { id: contentItem.id, title: contentItem.title, type: contentItem.type, status: contentItem.status, channel: null },
    idempotencyKey: `content_item.created:${contentItem.id}`,
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  redirect(`/dashboard/${input.projectId}/content/${contentItem.id}`);
}

export interface SaveGeneratedSocialIdeasInput {
  projectId: string;
  topic: string;
  platform: string;
  body: string;
  language: string;
}

/** Same local-generation-then-save pattern as saveGeneratedContentAction, for the "Ideas para redes sociales" tool. */
export async function saveGeneratedSocialIdeasAction(
  input: SaveGeneratedSocialIdeasInput
): Promise<SaveGeneratedContentState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.topic.trim()) return { error: "Describe sobre qué quieres ideas." };
  if (!input.body.trim()) return { error: "No hay ideas generadas que guardar." };

  await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "SOCIAL_TEXT",
      title: `Ideas para ${input.platform}: ${input.topic}`.slice(0, 120),
      body: input.body,
      language: input.language,
      sourceTool: "ideas-redes-sociales",
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  return {};
}

export interface SaveGeneratedContentAdaptationInput {
  projectId: string;
  targetPlatform: string;
  body: string;
  language: string;
}

/** Same local-generation-then-save pattern as saveGeneratedContentAction, for the "Adaptador de contenido" tool. */
export async function saveGeneratedContentAdaptationAction(
  input: SaveGeneratedContentAdaptationInput
): Promise<SaveGeneratedContentState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.body.trim()) return { error: "No hay contenido adaptado que guardar." };

  await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Adaptado para ${input.targetPlatform}`.slice(0, 120),
      body: input.body,
      language: input.language,
      sourceTool: "adaptador-contenido",
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "ADAPTATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  return {};
}

export interface AutosaveContentItemInput {
  id: string;
  title?: string;
  body: string;
}

/**
 * Debounced-autosave counterpart to updateContentItemAction: updates the
 * live ContentItem directly, WITHOUT creating a ContentVersion snapshot.
 * updateContentItemAction snapshots the pre-edit state on every call — fine
 * for an explicit "Guardar cambios"/"Guardar versión" click, but autosave
 * fires on every debounced keystroke pause, which would otherwise flood the
 * version history with near-duplicate rows. Explicit checkpoints still go
 * through updateContentItemAction (see ContentEditorPanel's "Guardar
 * versión" button).
 */
export async function autosaveContentItemAction(projectId: string, input: AutosaveContentItemInput): Promise<{ error?: string }> {
  const parsed = updateContentItemSchema.safeParse({ id: input.id, title: input.title, body: input.body });
  if (!parsed.success) return { error: "No se pudo guardar automáticamente." };

  await requireProjectAccess(projectId, "EDITOR");

  const current = await prisma.contentItem.findUnique({ where: { id: parsed.data.id } });
  if (!current || current.projectId !== projectId) return { error: "Contenido no encontrado." };

  await prisma.contentItem.update({
    where: { id: current.id },
    data: {
      title: parsed.data.title ?? current.title,
      body: parsed.data.body ?? current.body,
    },
  });

  return {};
}

export async function updateContentItemAction(projectId: string, formData: FormData) {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const parsed = updateContentItemSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    body: formData.get("body") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return;

  const current = await prisma.contentItem.findUnique({ where: { id: parsed.data.id } });
  if (!current || current.projectId !== projectId) return;

  await prisma.$transaction([
    prisma.contentVersion.create({
      data: {
        contentItemId: current.id,
        authorId: user.id,
        title: current.title,
        body: current.body,
        note: parsed.data.note || null,
      },
    }),
    prisma.contentItem.update({
      where: { id: current.id },
      data: {
        title: parsed.data.title ?? current.title,
        body: parsed.data.body ?? current.body,
      },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/content/${current.id}`);
}

export interface UpdateContentMetadataInput {
  id: string;
  status?: string;
  channel?: string;
  objective?: string;
  tone?: string;
  targetAudience?: string;
  cta?: string;
  seoKeyword?: string;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  searchIntent?: string;
  brandProfileId?: string | null;
}

/**
 * Sidebar "Resumen"/"SEO" tabs — updates ONLY metadata (never title/body),
 * and never creates a ContentVersion (metadata isn't prose, so it isn't
 * version-worthy — matches autosaveContentItemAction's reasoning). Callers
 * are expected to send the full current metadata snapshot each time (not a
 * partial patch) since this always replaces every field.
 */
export async function updateContentMetadataAction(
  projectId: string,
  input: UpdateContentMetadataInput
): Promise<{ error?: string }> {
  const parsed = updateContentMetadataSchema.safeParse(input);
  if (!parsed.success) return { error: "No se pudieron guardar los metadatos." };

  await requireProjectAccess(projectId, "EDITOR");

  const current = await prisma.contentItem.findUnique({ where: { id: parsed.data.id } });
  if (!current || current.projectId !== projectId) return { error: "Contenido no encontrado." };

  await prisma.contentItem.update({
    where: { id: current.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      channel: parsed.data.channel || null,
      objective: parsed.data.objective || null,
      tone: parsed.data.tone || null,
      targetAudience: parsed.data.targetAudience || null,
      cta: parsed.data.cta || null,
      seoKeyword: parsed.data.seoKeyword || null,
      seoTitle: parsed.data.seoTitle || null,
      seoDescription: parsed.data.seoDescription || null,
      slug: parsed.data.slug || null,
      searchIntent: parsed.data.searchIntent || null,
      ...(parsed.data.brandProfileId !== undefined ? { brandProfileId: parsed.data.brandProfileId } : {}),
    },
  });

  revalidatePath(`/dashboard/${projectId}/content/${current.id}`);
  return {};
}

export interface UpdateContentChecklistInput {
  checklist: Record<string, boolean>;
  assigneeName: string | null;
}

/** Sidebar "Publicación" tab's checklist — a single Json column, see prisma/schema.prisma's ContentItem.publishChecklist. */
export async function updateContentChecklistAction(
  projectId: string,
  contentId: string,
  plan: UpdateContentChecklistInput
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");

  const current = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!current || current.projectId !== projectId) return { error: "Contenido no encontrado." };

  await prisma.contentItem.update({
    where: { id: contentId },
    data: { publishChecklist: plan as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/dashboard/${projectId}/content/${contentId}`);
  return {};
}

/**
 * Sidebar "Versiones" tab's restore — snapshots the CURRENT state into a new
 * ContentVersion first (so restoring is itself undoable, same as any other
 * edit), then applies the chosen version's title/body. Mirrors
 * updateContentItemAction's transaction shape exactly.
 */
export async function restoreContentVersionAction(
  projectId: string,
  contentId: string,
  versionId: string
): Promise<{ error?: string; title?: string; body?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const version = await prisma.contentVersion.findUnique({ where: { id: versionId } });
  if (!version || version.contentItemId !== contentId) return { error: "Versión no encontrada." };

  const current = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!current || current.projectId !== projectId) return { error: "Contenido no encontrado." };

  await prisma.$transaction([
    prisma.contentVersion.create({
      data: {
        contentItemId: current.id,
        authorId: user.id,
        title: current.title,
        body: current.body,
        note: "Restauración automática antes de aplicar una versión anterior",
      },
    }),
    prisma.contentItem.update({
      where: { id: current.id },
      data: { title: version.title, body: version.body },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/content/${current.id}`);
  return { title: version.title, body: version.body };
}

/** Sidebar "Versiones" tab's "duplicar una versión" — creates a NEW ContentItem sourced from a historical version's text, linked back via sourceContentId (never touches the live item). */
export async function duplicateContentVersionAction(
  projectId: string,
  contentId: string,
  versionId: string
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const version = await prisma.contentVersion.findUnique({ where: { id: versionId } });
  if (!version || version.contentItemId !== contentId) return { error: "Versión no encontrada." };

  const original = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!original || original.projectId !== projectId) return { error: "Contenido no encontrado." };

  const copy = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: original.type,
      title: `${version.title} (copia de versión)`.slice(0, 300),
      body: version.body,
      language: original.language,
      sourceContentId: original.id,
      sourceTool: "editor-version-duplicate",
    },
  });

  revalidatePath(`/dashboard/${projectId}/content`);
  return { id: copy.id };
}

export interface CreateRepurposedContentInput {
  projectId: string;
  sourceContentId: string;
  channel: string;
  type: ContentType;
  title: string;
  body: string;
  brandProfileId?: string | null;
}

/**
 * Sidebar "Reutilizar" tab — creates a new ContentItem for one repurposing
 * channel, always linked back to the item it came from via sourceContentId
 * (ContentItem's own self-relation, see prisma/schema.prisma) so
 * sourceContent/derivedContent reflect a REAL relationship — never just a
 * copy-pasted, disconnected text blob (unlike the older, free-text
 * saveGeneratedContentAdaptationAction above, which predates this feature).
 */
export async function createRepurposedContentAction(
  input: CreateRepurposedContentInput
): Promise<SaveGeneratedContentState & { id?: string }> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.body.trim()) return { error: "No hay contenido que guardar." };

  const source = await prisma.contentItem.findUnique({ where: { id: input.sourceContentId } });
  if (!source || source.projectId !== input.projectId) return { error: "Contenido de origen no encontrado." };

  const created = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: input.type,
      title: input.title.slice(0, 300),
      body: input.body,
      language: source.language,
      channel: input.channel,
      sourceContentId: input.sourceContentId,
      sourceTool: "editor-repurpose",
      brandProfileId: input.brandProfileId || null,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "ADAPTATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  revalidatePath(`/dashboard/${input.projectId}/content/${input.sourceContentId}`);
  return { id: created.id };
}

export async function changeContentStatusAction(projectId: string, contentId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const before = await prisma.contentItem.findUnique({ where: { id: contentId }, select: { status: true, title: true } });
  await prisma.contentItem.update({ where: { id: contentId }, data: { status: status as never } });

  if (before && before.status !== status) {
    await publishAutomationEvent({
      projectId,
      eventKey: "content_item.status_changed",
      resourceId: contentId,
      payload: { id: contentId, title: before.title, status, previous: before.status, current: status, changedFields: ["status"] },
      idempotencyKey: `content_item.status_changed:${contentId}:${before.status}:${status}:${Date.now()}`,
    });
  }

  revalidatePath(`/dashboard/${projectId}/content/${contentId}`);
  revalidatePath(`/dashboard/${projectId}/content`);
}

export async function toggleFavoriteContentAction(projectId: string, contentId: string, next: boolean) {
  await requireProjectAccess(projectId, "VIEWER");
  await prisma.contentItem.update({ where: { id: contentId }, data: { isFavorite: next } });
  revalidatePath(`/dashboard/${projectId}/content`);
}

export async function archiveContentAction(projectId: string, contentId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.contentItem.update({ where: { id: contentId }, data: { isArchived: true } });
  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content`);
}

export async function deleteContentAction(projectId: string, contentId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.contentItem.update({ where: { id: contentId }, data: { deletedAt: new Date() } });
  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content`);
}

export async function duplicateContentAction(projectId: string, contentId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const original = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!original || original.projectId !== projectId) return;

  const copy = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: original.type,
      title: `${original.title} (copia)`,
      body: original.body,
      language: original.language,
      targetAudience: original.targetAudience,
      tone: original.tone,
      keywords: original.keywords,
      cta: original.cta,
      sourceContentId: original.id,
    },
  });

  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content/${copy.id}`);
}

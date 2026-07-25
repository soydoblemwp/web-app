"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

export interface SaveAiToolResultInput {
  projectId: string;
  toolSlug: string;
  title: string;
  body: string;
  language: string;
}

export interface SaveAiToolResultState {
  error?: string;
  /** The real, server-created ContentItem id — the UI must use this (never a client-guessed value) for edit/favorite/open-in-workspace. */
  contentItemId?: string;
}

/**
 * Single save-only action shared by every AI Center tool (YouTube today,
 * future platforms later): the browser already generated the text locally
 * (see src/lib/ai/local) — this only ever persists it. `contentType` and
 * `resultKind` always come from the server-side tool definition, never from
 * the client, so a tampered toolSlug can at most fail lookup, never write
 * an arbitrary ContentType.
 */
export async function saveAiToolResultAction(input: SaveAiToolResultInput): Promise<SaveAiToolResultState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  const tool = findToolDefinition(input.toolSlug);
  if (!tool) return { error: "Herramienta no reconocida." };
  if (!input.body.trim()) return { error: "No hay contenido generado que guardar." };

  const created = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: tool.contentType,
      title: input.title.slice(0, 120),
      body: input.body,
      language: input.language,
      sourceTool: tool.slug,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: tool.resultKind,
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  revalidatePath(`/dashboard/${input.projectId}/workspace`);
  return { contentItemId: created.id };
}

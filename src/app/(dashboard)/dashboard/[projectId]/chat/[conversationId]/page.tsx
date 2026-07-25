import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { getConversationForProject } from "@/server/services/assistant";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { listPromptsForAssistantContext } from "@/server/services/prompt-library";
import { buildPromptLibraryAssistantContext } from "@/lib/prompt-library/assistant-context";
import { listTemplatesForAssistantContext } from "@/server/services/ai-templates";
import { buildAiTemplatesAssistantContext } from "@/lib/ai-templates/assistant-context";
import { getDefaultBrandProfileForUser } from "@/server/services/brand-profiles";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { listWorkflowsForAssistantContext } from "@/server/services/ai-workflows";
import { buildWorkflowsAssistantContext } from "@/lib/ai-workflows/assistant-context";
import { ChatPanel } from "@/components/chat/chat-panel";

export const metadata: Metadata = { title: "Chat IA" };

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  // getConversationForProject verifies the conversation belongs to both
  // this project and this user before returning it — a conversationId is
  // client-supplied (the URL), so it is never trusted on its own.
  const conversation = await getConversationForProject(projectId, conversationId, user.id);
  if (!conversation) notFound();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });

  // Prompt Library, AI Templates, Brand Kit and AI Workflows context is
  // appended (never merged into buildBrandContext itself) so only Chat IA's
  // general assistant reply sees this — every other AI Center tool page
  // keeps calling buildBrandContext exactly as before, unaffected by this.
  // See src/lib/prompt-library/assistant-context.ts,
  // src/lib/ai-templates/assistant-context.ts,
  // src/lib/brand-profiles/context.ts and
  // src/lib/ai-workflows/assistant-context.ts for how "usa mi prompt
  // favorito", "completa mi template Email", "escribe como mi marca" and
  // "ejecuta mi workflow SEO" get resolved without touching chat-panel.tsx
  // or intent-router.ts.
  const [savedPrompts, savedTemplates, defaultBrandProfile, workflows] = await Promise.all([
    listPromptsForAssistantContext(user.id, projectId),
    listTemplatesForAssistantContext(user.id, projectId),
    getDefaultBrandProfileForUser(user.id),
    listWorkflowsForAssistantContext(user.id, projectId),
  ]);
  const promptLibraryContext = buildPromptLibraryAssistantContext(savedPrompts);
  const aiTemplatesContext = buildAiTemplatesAssistantContext(savedTemplates);
  const brandProfileContext = defaultBrandProfile ? buildBrandProfileContext(defaultBrandProfile) : "";
  const workflowsContext = buildWorkflowsAssistantContext(workflows);
  const brandContextText = [
    buildBrandContext(project, brandKit),
    brandProfileContext,
    promptLibraryContext,
    aiTemplatesContext,
    workflowsContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <ChatPanel
      projectId={projectId}
      conversationId={conversationId}
      initialMessages={conversation.messages.map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        createdAt: message.createdAt,
      }))}
      brandContextText={brandContextText}
    />
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getConversationWithMessages } from "@/server/services/assistant";
import { deleteConversationAction } from "@/server/actions/assistant";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { AssistantChatPanel } from "@/components/assistant/chat-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;
  const conversation = await getConversationWithMessages(conversationId);
  if (!conversation || conversation.projectId !== projectId) notFound();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  return (
    <div className="flex h-full max-w-3xl flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="truncate text-lg font-semibold">{conversation.title}</h1>
        <form action={deleteConversationAction.bind(null, projectId, conversationId)}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Eliminar conversación">
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>

      <AssistantChatPanel
        projectId={projectId}
        conversationId={conversationId}
        initialMessages={conversation.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }))}
        brandContextText={brandContextText}
      />
    </div>
  );
}

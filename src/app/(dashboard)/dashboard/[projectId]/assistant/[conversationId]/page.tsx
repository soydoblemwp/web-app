import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { getConversationWithMessages } from "@/server/services/assistant";
import { deleteConversationAction } from "@/server/actions/assistant";
import { ChatMessageForm } from "@/components/assistant/chat-message-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;
  const conversation = await getConversationWithMessages(conversationId);
  if (!conversation || conversation.projectId !== projectId) notFound();

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

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {conversation.messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Escribe el primer mensaje para empezar la conversación.
          </p>
        ) : (
          conversation.messages.map((message) => (
            <div
              key={message.id}
              className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap", {
                "ml-auto bg-primary text-primary-foreground": message.role === "user",
                "bg-muted": message.role !== "user",
              })}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <ChatMessageForm projectId={projectId} conversationId={conversationId} />
    </div>
  );
}

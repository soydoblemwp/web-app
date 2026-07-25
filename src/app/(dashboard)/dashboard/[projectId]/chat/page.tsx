import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle, Plus } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listConversations } from "@/server/services/assistant";
import { createChatConversationAction } from "@/server/actions/assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Chat IA" };

export default async function ChatIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");
  const conversations = await listConversations(projectId, user.id);

  // Land directly on the most recently active conversation, like opening a
  // familiar chat app — conversations are already sorted by last activity.
  if (conversations.length > 0) {
    redirect(`/dashboard/${projectId}/chat/${conversations[0].id}`);
  }

  return (
    <Card className="flex h-full items-center justify-center border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <MessageCircle className="size-10 text-muted-foreground" />
        <h2 className="text-lg font-medium">Sin conversaciones todavía</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Inicia una conversación para generar ideas, resumir información o mejorar textos con IA.
        </p>
        <form action={createChatConversationAction.bind(null, projectId)}>
          <Button type="submit">
            <Plus className="mr-1 size-4" /> Nueva conversación
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

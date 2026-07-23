import Link from "next/link";
import type { Metadata } from "next";
import { Bot, Plus } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listConversations } from "@/server/services/assistant";
import { createConversationAction } from "@/server/actions/assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAIEnabled } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Asistente IA" };

export default async function AssistantPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");
  const conversations = await listConversations(projectId, user.id);
  const createAction = createConversationAction.bind(null, projectId);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asistente IA</h1>
          <p className="text-sm text-muted-foreground">Conversaciones guardadas para este proyecto.</p>
        </div>
        <form action={createAction}>
          <Button type="submit">
            <Plus className="mr-1 size-4" /> Nueva conversación
          </Button>
        </form>
      </div>

      {!isAIEnabled() ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">
            El asistente de IA no está configurado (falta ANTHROPIC_API_KEY). Puedes crear conversaciones, pero no
            recibirás respuesta hasta que se configure una clave de API.
          </CardContent>
        </Card>
      ) : null}

      {conversations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Bot className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">Sin conversaciones todavía</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Inicia una conversación para generar ideas, resumir información o mejorar textos con IA.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/dashboard/${projectId}/assistant/${conversation.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50"
              >
                <span className="truncate">{conversation.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {conversation.updatedAt.toLocaleDateString("es-ES")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

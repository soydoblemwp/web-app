import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listConversationsAction } from "@/server/actions/customer-support";
import { ConversationsAdmin } from "@/components/customer-support/conversations-admin";

export const metadata: Metadata = { title: "Conversaciones — Servicio al cliente" };

export default async function CustomerSupportConversationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const result = await listConversationsAction(projectId, {});
  const conversations = "error" in result ? [] : result.conversations;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversaciones</h1>
        <p className="text-sm text-muted-foreground">Bandeja de conversaciones reales del widget publico.</p>
      </div>
      <ConversationsAdmin
        projectId={projectId}
        initialConversations={conversations.map((c) => ({
          id: c.id,
          publicId: c.publicId,
          status: c.status,
          language: c.language,
          category: c.category,
          originPage: c.originPage,
          lastResponseType: c.lastResponseType,
          lastEvidence: c.lastEvidence,
          escalated: c.escalated,
          messageCount: c.messageCount,
          startedAt: c.startedAt.toISOString(),
        }))}
      />
    </div>
  );
}

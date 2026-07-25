import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listConversations } from "@/server/services/assistant";
import { ChatConversationList } from "@/components/chat/chat-conversation-list";

export const metadata: Metadata = { title: "Chat IA" };

/**
 * Persistent split view for Chat IA: the conversation list on the left
 * (see ChatConversationList) stays mounted across every /chat/* navigation,
 * exactly like the app's own Sidebar persists across /dashboard/* pages.
 * Reuses listConversations as-is — already project+user scoped, already
 * sorted by last activity (updatedAt desc).
 */
export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");
  const conversations = await listConversations(projectId, user.id);

  return (
    <div className="flex h-full gap-4">
      <ChatConversationList projectId={projectId} conversations={conversations} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

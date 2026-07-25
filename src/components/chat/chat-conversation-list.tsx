"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Check, X } from "lucide-react";
import { createChatConversationAction, renameConversationAction, deleteChatConversationAction } from "@/server/actions/assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

/**
 * Persistent conversation list for the Chat IA route — new, search, rename,
 * delete, active highlight. Lives in the route's layout so it survives
 * navigation between conversations, the same way the app's own Sidebar
 * persists across every dashboard page.
 */
export function ChatConversationList({
  projectId,
  conversations,
}: {
  projectId: string;
  conversations: ChatConversationSummary[];
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const activeId = pathname.split("/").pop();
  const hasActiveConversation = conversations.some((conversation) => conversation.id === activeId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <div
      className={cn(
        "w-full flex-col border-r md:w-72 md:shrink-0",
        hasActiveConversation ? "hidden md:flex" : "flex"
      )}
    >
      <div className="space-y-2 border-b p-3">
        <form action={createChatConversationAction.bind(null, projectId)}>
          <Button type="submit" className="w-full" size="sm">
            <Plus className="size-4" /> Nueva conversación
          </Button>
        </form>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversaciones..."
            className="pl-7"
            aria-label="Buscar conversaciones"
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="p-4 text-center text-sm text-muted-foreground">
            {conversations.length === 0 ? "Sin conversaciones todavía." : "Sin resultados."}
          </li>
        ) : (
          filtered.map((conversation) => {
            const isActive = conversation.id === activeId;
            const isRenaming = renamingId === conversation.id;

            if (isRenaming) {
              return (
                <li key={conversation.id} className="border-b">
                  <form
                    action={async (formData) => {
                      const title = String(formData.get("title") ?? "");
                      await renameConversationAction(projectId, conversation.id, title);
                      setRenamingId(null);
                    }}
                    className="flex items-center gap-1 p-2"
                  >
                    <Input
                      name="title"
                      defaultValue={conversation.title}
                      autoFocus
                      maxLength={200}
                      className="h-7 text-sm"
                      aria-label="Nuevo nombre de la conversación"
                    />
                    <Button type="submit" variant="ghost" size="icon-xs" aria-label="Guardar nombre">
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Cancelar renombrado"
                      onClick={() => setRenamingId(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </form>
                </li>
              );
            }

            return (
              <li key={conversation.id} className={cn("group border-b", isActive && "bg-sidebar-accent")}>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <Link
                    href={`/dashboard/${projectId}/chat/${conversation.id}`}
                    className="min-w-0 flex-1 truncate rounded px-1 py-1 text-sm hover:bg-sidebar-accent"
                  >
                    {conversation.title}
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Renombrar conversación"
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={() => setRenamingId(conversation.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <form action={deleteChatConversationAction.bind(null, projectId, conversation.id)}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Eliminar conversación"
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

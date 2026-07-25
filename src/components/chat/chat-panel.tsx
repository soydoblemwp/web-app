"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { buildAssistantSystemPrompt } from "@/lib/ai/prompts/assistant";
import { saveAssistantExchangeAction, saveConversationToWorkspaceAction } from "@/server/actions/assistant";
import { buildIntentClassifierSystemPrompt, parseIntentClassifierResponse } from "@/lib/chat/intent-router";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { ChatMessageBubble, type ChatMessageData } from "@/components/chat/chat-message-bubble";
import { ChatComposer } from "@/components/chat/chat-composer";
import { Button } from "@/components/ui/button";

/** How many recent turns the (invisible) intent classifier sees — enough for "haz otros"/"más cortos" to resolve, small enough to stay fast. */
const CLASSIFIER_HISTORY_WINDOW = 4;
/** The classifier only ever needs to answer with one slug or "NONE". */
const CLASSIFIER_MAX_TOKENS = 20;

/**
 * The Chat IA conversation view: message history, composer and per-message
 * actions. Generation always goes through the shared useLocalAI hook — the
 * same local, in-browser engine every AI Center tool uses; nothing here
 * talks to a server-side AI provider or keeps a second copy of that engine.
 *
 * Every message is silently routed first: one extra, invisible generation
 * asks the same local model which AI Center tool (if any) the message
 * matches (see src/lib/chat/intent-router.ts). If one matches, that tool's
 * own buildSystemPrompt is reused for the real reply — never a duplicated
 * or reimplemented prompt. The user only ever sees one normal reply.
 */
export function ChatPanel({
  projectId,
  conversationId,
  initialMessages,
  brandContextText,
}: {
  projectId: string;
  conversationId: string;
  initialMessages: ChatMessageData[];
  brandContextText: string;
}) {
  const ai = useLocalAI();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [savingToWorkspace, setSavingToWorkspace] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function sendMessage(text: string) {
    setError(null);

    const history = messages.map((message) => ({ role: message.role, content: message.content }));

    const userMessage: ChatMessageData = {
      id: `local-${Date.now()}-u`,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Invisible routing step, same engine, same call shape as the real
    // reply below — see the class-level comment for why this exists.
    const classifierReply = await ai.generate({
      system: buildIntentClassifierSystemPrompt(),
      history: history.slice(-CLASSIFIER_HISTORY_WINDOW),
      prompt: text,
      maxTokens: CLASSIFIER_MAX_TOKENS,
    });
    if (!classifierReply) return; // cancelled or failed — stop here, never fire a second generation the user didn't ask to continue

    const routedToolSlug = parseIntentClassifierResponse(classifierReply);
    const routedTool = routedToolSlug ? findToolDefinition(routedToolSlug) : undefined;
    const system = routedTool ? routedTool.buildSystemPrompt(brandContextText) : buildAssistantSystemPrompt(brandContextText);

    // Streaming isn't available yet in the shared local engine (it always
    // awaits the full completion) — see src/lib/ai/local/engine.ts. This
    // await boundary is the seam where a future token-by-token stream would
    // plug in (progressively updating one assistant message) without
    // changing anything about how messages are sent or persisted.
    const replyText = await ai.generate({ system, history, prompt: text });
    if (!replyText) return; // cancelled or failed — nothing persisted, no orphaned assistant message

    const assistantMessage: ChatMessageData = {
      id: `local-${Date.now()}-a`,
      role: "assistant",
      content: replyText,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    const result = await saveAssistantExchangeAction({
      projectId,
      conversationId,
      userMessage: text,
      assistantMessage: replyText,
    });
    if (result.error) setError(result.error);
  }

  async function handleRegenerate() {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage || busy) return;
    await sendMessage(lastUserMessage.content);
  }

  async function handleSaveToWorkspace() {
    setSavingToWorkspace(true);
    const result = await saveConversationToWorkspaceAction(projectId, conversationId);
    setSavingToWorkspace(false);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Conversación guardada en el Workspace.");
    }
  }

  const lastMessage = messages[messages.length - 1];
  const canRegenerate = lastMessage?.role === "assistant" && !busy;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" disabled={savingToWorkspace} onClick={handleSaveToWorkspace}>
          {savingToWorkspace ? <Loader2 className="size-3.5 animate-spin" /> : <BookmarkPlus className="size-3.5" />}
          Guardar en Workspace
        </Button>
      </div>

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Escribe el primer mensaje para empezar la conversación.
          </p>
        ) : (
          messages.map((message, index) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              canRegenerate={canRegenerate && index === messages.length - 1}
              onRegenerate={handleRegenerate}
              regenerating={busy}
            />
          ))
        )}
        {busy ? (
          <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Escribiendo...</div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2">
        <LocalAIStatusPanel ai={ai} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ChatComposer onSend={sendMessage} onStop={ai.cancel} busy={busy} />
      </div>
    </div>
  );
}

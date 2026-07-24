"use client";

import { useRef, useState } from "react";
import { buildAssistantSystemPrompt } from "@/lib/ai/prompts/assistant";
import { saveAssistantExchangeAction } from "@/server/actions/assistant";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AssistantChatPanel({
  projectId,
  conversationId,
  initialMessages,
  brandContextText,
}: {
  projectId: string;
  conversationId: string;
  initialMessages: ChatMessage[];
  brandContextText: string;
}) {
  const ai = useLocalAI();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const text = String(formData.get("message") ?? "").trim();
    if (!text) return setFormError("Escribe un mensaje.");
    if (text.length > 8000) return setFormError("El mensaje es demasiado largo.");

    const system = buildAssistantSystemPrompt(brandContextText);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    const replyText = await ai.generate({ system, history, prompt: text });
    if (!replyText) return;

    formRef.current?.reset();
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${prev.length}`, role: "user", content: text },
      { id: `local-assistant-${prev.length}`, role: "assistant", content: replyText },
    ]);

    const result = await saveAssistantExchangeAction({
      projectId,
      conversationId,
      userMessage: text,
      assistantMessage: replyText,
    });
    if (result.error) setFormError(result.error);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Escribe el primer mensaje para empezar la conversación.
          </p>
        ) : (
          messages.map((message) => (
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

      <div className="space-y-2">
        <LocalAIStatusPanel ai={ai} />
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            name="message"
            rows={3}
            maxLength={8000}
            required
            placeholder="Escribe tu mensaje..."
            disabled={busy}
          />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Generando..." : "Enviar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

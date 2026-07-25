"use client";

import { toast } from "sonner";
import { Copy, RotateCcw } from "lucide-react";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

/**
 * One message bubble. User messages render as plain text (matching what
 * they typed); assistant messages render through the same
 * UniversalResultViewer/parseResultBlocks every AI Center tool and the
 * Workspace already use — one renderer, not a second one.
 */
export function ChatMessageBubble({
  message,
  canRegenerate = false,
  onRegenerate,
  regenerating = false,
}: {
  message: ChatMessageData;
  /** Only the most recent assistant message can be regenerated. */
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const isUser = message.role === "user";

  function handleCopy() {
    void navigator.clipboard.writeText(message.content);
    toast.success("Mensaje copiado.");
  }

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <UniversalResultViewer blocks={parseResultBlocks(message.content)} />
        )}
      </div>
      <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <span>{message.createdAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
        {!isUser ? (
          <>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Copiar respuesta" onClick={handleCopy}>
              <Copy className="size-3" />
            </Button>
            {canRegenerate && onRegenerate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Regenerar respuesta"
                disabled={regenerating}
                onClick={onRegenerate}
              >
                <RotateCcw className="size-3" />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

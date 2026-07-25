"use client";

import { useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_MESSAGE_LENGTH = 8000;

/**
 * Professional chat input: grows with content (up to a cap), Enter sends,
 * Shift+Enter inserts a newline, and swaps to a Stop button while the local
 * model is generating. No new UI library — plain textarea + auto-resize.
 */
export function ChatComposer({
  onSend,
  onStop,
  busy,
  disabled = false,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value);
    resize(event.target);
  }

  function submit() {
    const text = value.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-lg border bg-background p-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={1}
        disabled={disabled}
        placeholder="Escribe un mensaje... (Enter para enviar, Shift+Enter para salto de línea)"
        aria-label="Mensaje"
        className="max-h-60 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
      {busy ? (
        <Button type="button" variant="outline" size="icon" aria-label="Detener generación" onClick={onStop}>
          <Square className="size-4" />
        </Button>
      ) : (
        <Button type="button" size="icon" aria-label="Enviar mensaje" disabled={disabled || !value.trim()} onClick={submit}>
          <Send className="size-4" />
        </Button>
      )}
    </div>
  );
}

"use client";

import { useActionState, useRef, useEffect } from "react";
import { sendMessageAction, type SendMessageFormState } from "@/server/actions/assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: SendMessageFormState = {};

export function ChatMessageForm({ projectId, conversationId }: { projectId: string; conversationId: string }) {
  const action = sendMessageAction.bind(null, projectId, conversationId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isPending && !state.error) {
      formRef.current?.reset();
    }
  }, [isPending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Textarea
        name="message"
        rows={3}
        maxLength={8000}
        required
        placeholder="Escribe tu mensaje..."
        disabled={isPending}
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enviando..." : "Enviar"}
        </Button>
      </div>
    </form>
  );
}

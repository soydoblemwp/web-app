"use client";

import { useActionState } from "react";
import { createFaqAdminAction, updateFaqAdminAction, type FaqFormState } from "@/server/actions/admin-customer-support";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: FaqFormState = {};

/** Shared create/edit form — edit mode is entered by passing an existing `faq`. */
export function FaqForm({
  projectId,
  faq,
}: {
  projectId: string;
  faq?: { id: string; question: string; answer: string; category: string | null };
}) {
  const action = faq ? updateFaqAdminAction.bind(null, projectId, faq.id) : createFaqAdminAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="faq-question">Pregunta</Label>
        <Input id="faq-question" name="question" required maxLength={CUSTOMER_SUPPORT_LIMITS.MAX_QUESTION_LENGTH} defaultValue={faq?.question} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="faq-answer">Respuesta</Label>
        <Textarea id="faq-answer" name="answer" required rows={5} maxLength={CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH} defaultValue={faq?.answer} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="faq-category">Categoría (opcional)</Label>
        <Input id="faq-category" name="category" maxLength={100} defaultValue={faq?.category ?? ""} />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-muted-foreground">Guardado como borrador (DRAFT). Publícala para que quede visible al agente.</p> : null}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Guardando..." : faq ? "Guardar cambios" : "Crear FAQ (borrador)"}
      </Button>
    </form>
  );
}

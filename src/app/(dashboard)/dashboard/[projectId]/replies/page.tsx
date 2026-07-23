import type { Metadata } from "next";
import { GenerateReplyForm } from "@/components/replies/generate-reply-form";
import { isAIEnabled } from "@/lib/ai/service";

export const metadata: Metadata = { title: "Respuestas" };

export default async function RepliesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generador de respuestas</h1>
        <p className="text-sm text-muted-foreground">
          Pega un comentario o mensaje y genera un borrador de respuesta acorde al tono de tu marca.
        </p>
      </div>
      {!isAIEnabled() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          El asistente de IA no está configurado (falta ANTHROPIC_API_KEY).
        </p>
      ) : null}
      <GenerateReplyForm projectId={projectId} />
    </div>
  );
}

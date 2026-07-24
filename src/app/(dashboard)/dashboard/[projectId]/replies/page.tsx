import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { GenerateReplyForm } from "@/components/replies/generate-reply-form";

export const metadata: Metadata = { title: "Respuestas" };

export default async function RepliesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generador de respuestas</h1>
        <p className="text-sm text-muted-foreground">
          Pega un comentario o mensaje y genera un borrador de respuesta acorde al tono de tu marca.
        </p>
      </div>
      <GenerateReplyForm projectId={projectId} brandContextText={brandContextText} />
    </div>
  );
}

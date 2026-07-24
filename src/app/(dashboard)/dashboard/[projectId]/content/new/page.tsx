import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { GenerateContentForm } from "@/components/content/generate-content-form";

export const metadata: Metadata = { title: "Generar contenido" };

export default async function NewContentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generar contenido</h1>
        <p className="text-sm text-muted-foreground">
          Describe lo que necesitas y la IA generará un primer borrador que podrás editar y guardar en la biblioteca.
        </p>
      </div>
      <GenerateContentForm projectId={projectId} brandContextText={brandContextText} />
    </div>
  );
}

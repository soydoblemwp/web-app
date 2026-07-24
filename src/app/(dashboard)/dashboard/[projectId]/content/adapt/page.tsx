import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { ContentAdapterForm } from "@/components/content/content-adapter-form";

export const metadata: Metadata = { title: "Adaptador de contenido" };

export default async function ContentAdaptPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adaptador de contenido</h1>
        <p className="text-sm text-muted-foreground">
          Pega una pieza de contenido existente y adáptala al formato y estilo de otra plataforma.
        </p>
      </div>
      <ContentAdapterForm projectId={projectId} brandContextText={brandContextText} />
    </div>
  );
}

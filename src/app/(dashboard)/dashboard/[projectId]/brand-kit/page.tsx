import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { BrandKitForm } from "@/components/brand-kit/brand-kit-form";
import { BrandTermsManager } from "@/components/brand-kit/brand-terms-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Kit de marca" };

export default async function BrandKitPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const brandKit = await prisma.brandKit.findUnique({
    where: { projectId },
    include: { terms: { orderBy: { createdAt: "desc" } } },
  });
  if (!brandKit) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kit de marca</h1>
        <p className="text-sm text-muted-foreground">
          Estas reglas se aplican automáticamente cuando el asistente de IA o el generador de contenido trabajan en
          este proyecto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidad de marca</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandKitForm projectId={projectId} brandKit={brandKit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Palabras preferidas y prohibidas</CardTitle>
        </CardHeader>
        <CardContent>
          <BrandTermsManager projectId={projectId} terms={brandKit.terms} />
        </CardContent>
      </Card>
    </div>
  );
}

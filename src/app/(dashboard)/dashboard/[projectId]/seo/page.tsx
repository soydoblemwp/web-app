import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { SeoAnalyzerForm } from "@/components/seo/seo-analyzer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const history = await prisma.seoAnalysis.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Herramientas SEO</h1>
        <p className="text-sm text-muted-foreground">
          Análisis basado en reglas deterministas y documentadas. No garantizamos posiciones en buscadores ni
          inventamos datos de volumen de búsqueda o dificultad.
        </p>
      </div>

      <SeoAnalyzerForm projectId={projectId} />

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de análisis</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-2">
                  <span className="truncate">{entry.title || "Sin título"}</span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{entry.createdAt.toLocaleString("es-ES")}</span>
                    <span className="font-medium text-foreground">{entry.score}/100</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

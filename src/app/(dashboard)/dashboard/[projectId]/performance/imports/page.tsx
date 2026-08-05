import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listImportsAction } from "@/server/actions/performance-imports";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IMPORT_STATUS_LABELS, IMPORT_STATUS_TONE, formatDateTime } from "@/components/performance/labels";
import { NewImportForm } from "@/components/performance/new-import-form";

export const metadata: Metadata = { title: "Performance — Importaciones" };

export default async function PerformanceImportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const imports = await listImportsAction(projectId);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/${projectId}/performance`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Volver al hub de Performance
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Upload className="size-6" /> Importar métricas
        </h1>
        <p className="text-sm text-muted-foreground">Importa mediciones externas desde CSV o JSON — se procesan en lotes persistentes, nunca se ejecuta ninguna fórmula del archivo.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <NewImportForm projectId={projectId} />
        </CardContent>
      </Card>

      {imports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="max-w-md text-sm text-muted-foreground">Todavía no hay importaciones registradas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {imports.map((imp) => (
            <Link key={imp.id} href={`/dashboard/${projectId}/performance/imports/${imp.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">
                      {imp.kind} {imp.platform ? `· ${imp.platform}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {imp.importedRows}/{imp.totalRows} filas importadas · creado {formatDateTime(imp.createdAt)}
                    </p>
                  </div>
                  <Badge variant={IMPORT_STATUS_TONE[imp.status] ?? "outline"}>{IMPORT_STATUS_LABELS[imp.status] ?? imp.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

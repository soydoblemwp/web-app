import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getImportDetailAction, previewImportAction } from "@/server/actions/performance-imports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_STATUS_LABELS, IMPORT_STATUS_TONE, formatDateTime } from "@/components/performance/labels";
import { ImportMappingWizard } from "@/components/performance/import-mapping-wizard";
import { ImportSummaryActions } from "@/components/performance/import-summary-actions";

export const metadata: Metadata = { title: "Detalle de importación" };

const NEEDS_MAPPING_STATUSES = ["DRAFT", "MAPPING", "FAILED", "CANCELLED"];

export default async function ImportDetailPage({ params }: { params: Promise<{ projectId: string; importId: string }> }) {
  const { projectId, importId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const importRow = await getImportDetailAction(projectId, importId);
  if (!importRow) notFound();

  const needsMapping = NEEDS_MAPPING_STATUSES.includes(importRow.status);
  const preview = needsMapping ? await previewImportAction(projectId, importId, 20) : null;

  const errorSummary = (importRow.errorSummary as string[] | null) ?? [];

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/performance/imports`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a importaciones
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {importRow.kind} {importRow.platform ? `· ${importRow.platform}` : ""}
            </CardTitle>
            <Badge variant={IMPORT_STATUS_TONE[importRow.status] ?? "outline"}>{IMPORT_STATUS_LABELS[importRow.status] ?? importRow.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Filas totales</p>
              <p className="font-medium">{importRow.totalRows}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Importadas</p>
              <p className="font-medium">{importRow.importedRows}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inválidas</p>
              <p className="font-medium">{importRow.invalidRows}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duplicadas</p>
              <p className="font-medium">{importRow.duplicateRows}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Creado por {importRow.createdBy?.name ?? importRow.createdBy?.email} el {formatDateTime(importRow.createdAt)}</p>

          {errorSummary.length > 0 ? (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {errorSummary.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          ) : null}

          <ImportSummaryActions projectId={projectId} importId={importId} status={importRow.status} />
        </CardContent>
      </Card>

      {needsMapping && preview && !("error" in preview) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurar mapeo de columnas</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportMappingWizard projectId={projectId} importId={importId} kind={importRow.kind as "CSV" | "JSON"} headers={preview.headers} sampleRows={preview.sampleRows} />
          </CardContent>
        </Card>
      ) : null}

      {needsMapping && preview && "error" in preview ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{preview.error}</CardContent>
        </Card>
      ) : null}

      {importRow.rows.length > 0 && !needsMapping ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filas ({importRow.rows.length} mostradas)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRow.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rowIndex + 1}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "IMPORTED" ? "secondary" : r.status === "INVALID" ? "destructive" : "outline"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-96 truncate text-xs text-muted-foreground">{r.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

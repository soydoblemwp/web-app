"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createReportSchema } from "@/lib/validation/performance";
import {
  createReport,
  regenerateReport,
  listReports,
  getReportDetail,
  archiveReport,
  renderReportAsText,
  saveReportAsContentItem,
  addReportToKnowledgeBase,
} from "@/server/services/performance-reports";
import { exportRowsAsCsv, exportRowsAsJson } from "@/lib/performance/export";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface ReportActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

export async function createReportAction(projectId: string, input: unknown): Promise<ReportActionResult> {
  const parsed = createReportSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createReport(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function regenerateReportAction(projectId: string, reportId: string): Promise<ReportActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await regenerateReport(projectId, reportId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function listReportsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listReports(projectId);
}

export async function getReportDetailAction(projectId: string, reportId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getReportDetail(projectId, reportId);
}

export async function archiveReportAction(projectId: string, reportId: string): Promise<ReportActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await archiveReport(projectId, reportId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function saveReportAsContentItemAction(projectId: string, reportId: string): Promise<ReportActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await saveReportAsContentItem(projectId, user.id, reportId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  return { id: result.id };
}

export async function addReportToKnowledgeBaseAction(projectId: string, reportId: string): Promise<ReportActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await addReportToKnowledgeBase(projectId, user.id, reportId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  return { id: result.id };
}

export async function exportReportAction(projectId: string, reportId: string, format: "csv" | "json" | "text"): Promise<{ content?: string; filename?: string; errorMessage?: string }> {
  await requireProjectAccess(projectId, "VIEWER");
  const report = await getReportDetail(projectId, reportId);
  if (!report) return { errorMessage: "No se encontró el informe." };

  if (format === "text") return { content: renderReportAsText(report), filename: `${report.title}.txt` };
  if (format === "json") return { content: exportRowsAsJson([report.summary as Record<string, unknown>], ["projectId", "createdById"]), filename: `${report.title}.json` };
  const summary = (report.summary as { recommendations?: Record<string, unknown>[] } | null) ?? {};
  return { content: exportRowsAsCsv(summary.recommendations ?? []), filename: `${report.title}.csv` };
}

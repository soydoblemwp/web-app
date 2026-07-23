"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { analyzeSeo, type SeoAnalysisResult } from "@/lib/seo/analyzer";

export interface SeoFormState {
  result?: SeoAnalysisResult;
  error?: string;
}

export async function runSeoAnalysisAction(
  projectId: string,
  _prevState: SeoFormState,
  formData: FormData
): Promise<SeoFormState> {
  await requireProjectAccess(projectId, "VIEWER");

  const title = String(formData.get("title") ?? "");
  const metaDescription = String(formData.get("metaDescription") ?? "");
  const targetKeyword = String(formData.get("targetKeyword") ?? "");
  const contentText = String(formData.get("contentText") ?? "");

  if (!contentText.trim()) {
    return { error: "Pega o escribe el contenido que quieres analizar." };
  }
  if (contentText.length > 30_000) {
    return { error: "El contenido supera el límite de 30.000 caracteres." };
  }

  const result = analyzeSeo({ title, metaDescription, targetKeyword, contentText });

  await prisma.seoAnalysis.create({
    data: {
      projectId,
      title: title || null,
      metaDescription: metaDescription || null,
      targetKeyword: targetKeyword || null,
      contentText,
      score: result.score,
      breakdown: result.checks as unknown as object,
    },
  });

  revalidatePath(`/dashboard/${projectId}/seo`);
  return { result };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard";
import { executeMonitorCheck } from "@/server/services/monitor";

export interface MonitorFormState {
  error?: string;
}

export async function createMonitorAction(
  projectId: string,
  _prevState: MonitorFormState,
  formData: FormData
): Promise<MonitorFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const frequency = Number(formData.get("checkFrequencyMinutes") ?? 1440);

  if (!name) return { error: "El nombre es obligatorio." };
  if (!url) return { error: "La URL es obligatoria." };

  try {
    await assertSafeExternalUrl(url);
  } catch (error) {
    return { error: error instanceof UnsafeUrlError ? error.message : "URL no válida." };
  }

  const monitor = await prisma.monitor.create({
    data: {
      projectId,
      name,
      url,
      checkFrequencyMinutes: Number.isFinite(frequency) && frequency >= 60 ? frequency : 1440,
    },
  });

  await executeMonitorCheck(monitor.id);

  revalidatePath(`/dashboard/${projectId}/monitoring`);
  redirect(`/dashboard/${projectId}/monitoring`);
}

export async function runMonitorNowAction(projectId: string, monitorId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await executeMonitorCheck(monitorId);
  revalidatePath(`/dashboard/${projectId}/monitoring`);
}

export async function toggleMonitorActiveAction(projectId: string, monitorId: string, isActive: boolean) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.monitor.update({ where: { id: monitorId }, data: { isActive } });
  revalidatePath(`/dashboard/${projectId}/monitoring`);
}

export async function deleteMonitorAction(projectId: string, monitorId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.monitor.delete({ where: { id: monitorId } });
  revalidatePath(`/dashboard/${projectId}/monitoring`);
}

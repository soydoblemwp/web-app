import "server-only";
import { prisma } from "@/lib/db/prisma";
import { executeMonitorCheck } from "@/server/services/monitor";
import { executeLinkCheck } from "@/server/services/link-checker";

interface ActionConfig {
  title?: string;
  message?: string;
  monitorId?: string;
  url?: string;
}

async function runAction(projectId: string, actionType: string, config: ActionConfig, ownerId: string) {
  switch (actionType) {
    case "CREATE_NOTIFICATION": {
      await prisma.notification.create({
        data: {
          projectId,
          userId: ownerId,
          type: "GENERIC",
          title: config.title || "Automatización ejecutada",
          message: config.message || "Una automatización se ha ejecutado correctamente.",
        },
      });
      return "Notificación creada.";
    }
    case "RUN_MONITOR": {
      if (!config.monitorId) throw new Error("Falta el monitor a ejecutar.");
      const result = await executeMonitorCheck(config.monitorId);
      return `Monitor ejecutado (${result.status}).`;
    }
    case "RUN_LINK_CHECK": {
      if (!config.url) throw new Error("Falta la URL a comprobar.");
      const link = await prisma.linkCheck.create({ data: { projectId, url: config.url } });
      const result = await executeLinkCheck(link.id);
      return `Enlace comprobado (${result.status}).`;
    }
    default:
      throw new Error(`Tipo de acción no soportado en esta versión: ${actionType}`);
  }
}

export async function executeAutomation(automationId: string, idempotencyKey: string) {
  const automation = await prisma.automation.findUniqueOrThrow({
    where: { id: automationId },
    include: { actions: { orderBy: { order: "asc" } }, project: { select: { ownerId: true } } },
  });

  const existing = await prisma.automationRun.findUnique({
    where: { automationId_idempotencyKey: { automationId, idempotencyKey } },
  });
  if (existing) return existing;

  const run = await prisma.automationRun.create({
    data: { automationId, status: "RUNNING", idempotencyKey },
  });

  try {
    const messages: string[] = [];
    for (const action of automation.actions) {
      const message = await runAction(
        automation.projectId,
        action.actionType,
        (action.config as ActionConfig) ?? {},
        automation.project.ownerId
      );
      messages.push(message);
    }

    return prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", message: messages.join(" "), finishedAt: new Date() },
    });
  } catch (error) {
    return prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "Error desconocido.",
        finishedAt: new Date(),
      },
    });
  }
}

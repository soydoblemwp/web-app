import "server-only";
import { prisma } from "@/lib/db/prisma";
import { safeFetch, extractTitle, extractMetaDescription, SafeFetchError } from "@/lib/security/safe-fetch";
import { UnsafeUrlError } from "@/lib/security/ssrf-guard";

export async function executeMonitorCheck(monitorId: string) {
  const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });

  try {
    const result = await safeFetch(monitor.url);
    const title = extractTitle(result.body);
    const description = extractMetaDescription(result.body);

    const lastRun = await prisma.monitorRun.findFirst({
      where: { monitorId, status: { not: "ERROR" } },
      orderBy: { createdAt: "desc" },
    });

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    if (lastRun && lastRun.title !== title) changes.push({ field: "title", oldValue: lastRun.title, newValue: title });
    if (lastRun && lastRun.description !== description) {
      changes.push({ field: "description", oldValue: lastRun.description, newValue: description });
    }

    const status = changes.length > 0 && lastRun ? "CHANGED" : "OK";

    await prisma.$transaction([
      prisma.monitorRun.create({
        data: {
          monitorId,
          status,
          httpStatus: result.httpStatus,
          durationMs: result.durationMs,
          title,
          description,
        },
      }),
      ...changes.map((change) =>
        prisma.monitorChange.create({ data: { monitorId, ...change } })
      ),
      prisma.monitor.update({
        where: { id: monitorId },
        data: { lastStatus: status, lastCheckedAt: new Date() },
      }),
    ]);

    return { status };
  } catch (error) {
    const message =
      error instanceof UnsafeUrlError || error instanceof SafeFetchError
        ? error.message
        : "Error inesperado al comprobar la URL.";

    await prisma.$transaction([
      prisma.monitorRun.create({
        data: { monitorId, status: "ERROR", errorMessage: message },
      }),
      prisma.monitor.update({
        where: { id: monitorId },
        data: { lastStatus: "ERROR", lastCheckedAt: new Date() },
      }),
    ]);

    return { status: "ERROR", error: message };
  }
}

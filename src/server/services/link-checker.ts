import "server-only";
import { prisma } from "@/lib/db/prisma";
import { safeFetch, SafeFetchError } from "@/lib/security/safe-fetch";
import { UnsafeUrlError } from "@/lib/security/ssrf-guard";

export async function executeLinkCheck(linkCheckId: string) {
  const link = await prisma.linkCheck.findUniqueOrThrow({ where: { id: linkCheckId } });

  try {
    const result = await safeFetch(link.url);
    const wasRedirected = result.finalUrl !== link.url;
    const status = result.httpStatus >= 200 && result.httpStatus < 400
      ? wasRedirected
        ? "REDIRECT"
        : "OK"
      : "BROKEN";

    await prisma.linkCheck.update({
      where: { id: linkCheckId },
      data: {
        status,
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        durationMs: result.durationMs,
        attemptCount: { increment: 1 },
        lastCheckedAt: new Date(),
        errorMessage: null,
      },
    });

    return { status };
  } catch (error) {
    const message =
      error instanceof UnsafeUrlError || error instanceof SafeFetchError
        ? error.message
        : "Error inesperado al comprobar el enlace.";

    await prisma.linkCheck.update({
      where: { id: linkCheckId },
      data: {
        status: "ERROR",
        attemptCount: { increment: 1 },
        lastCheckedAt: new Date(),
        errorMessage: message,
      },
    });

    return { status: "ERROR", error: message };
  }
}

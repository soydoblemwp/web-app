import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { widgetChatRequestSchema } from "@/lib/validation/customer-support";
import { handleVisitorMessage, handleGenerationComplete, handleGenerationFailed, handleFeedback, handleHandoffRequest, checkSessionCreationRateLimit } from "@/server/services/customer-support-widget";
import { getConfigByPublicId } from "@/server/services/customer-support-config";

/**
 * The real public/unauthenticated Customer Support Agent endpoint (Fase 40
 * spec section 25) — a visitor never supplies projectId/role/config/
 * sources/evidence/prompt/internal IDs directly; only an opaque `publicId`,
 * a client-generated session token, and their own text. A single `action`
 * discriminator covers the message/complete/generation_failed/feedback/
 * handoff flows described in the spec as one logical endpoint.
 *
 * Never breaks the rest of the app on failure (spec section 26: "si el rate
 * limiter falla, debe bloquear o degradar SOLAMENTE el chat") — every
 * failure path here returns a normal JSON error response, never throws past
 * this handler.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 20_000;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/** Never persists the raw IP anywhere (spec section 26: "no guardes IP completa si no es necesaria") — only ever a one-way hash, used solely for the rate limiter's key. */
function resolveIpHash(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : (request.headers.get("x-real-ip") ?? "unknown");
  return hashIp(ip || "unknown");
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "JSON no valido." }, { status: 400 });
    }
    if (typeof parsedBody !== "object" || parsedBody === null) {
      return NextResponse.json({ error: "Cuerpo de solicitud no valido." }, { status: 400 });
    }

    const parsed = widgetChatRequestSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos no validos." }, { status: 400 });
    }
    const body = parsed.data;
    const ipHash = resolveIpHash(request);
    // Never trusted as the source of truth for tenant resolution (publicId still owns that) — only used to authorize which hostname this publicId may legitimately be used from (spec section 7).
    const originHeader = request.headers.get("origin");

    if (body.action === "message" && !body.conversationPublicId) {
      const config = await getConfigByPublicId(body.publicId);
      const allowed = await checkSessionCreationRateLimit(ipHash, config?.projectId ?? null);
      if (!allowed) return NextResponse.json({ error: "Demasiadas conversaciones nuevas desde tu red. Intenta mas tarde." }, { status: 429 });
    }

    const result = await (async () => {
      switch (body.action) {
        case "message":
          return handleVisitorMessage(body, ipHash, originHeader);
        case "complete":
          return handleGenerationComplete(body, originHeader);
        case "generation_failed":
          return handleGenerationFailed(body, originHeader);
        case "feedback":
          return handleFeedback(body, originHeader);
        case "handoff":
          return handleHandoffRequest(body, originHeader);
      }
    })();

    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "No se pudo procesar la solicitud del chat de soporte." }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { receiveWebhook } from "@/server/services/automation-webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public incoming webhook receiver for WEBHOOK-triggered automations (spec
 * sections 11-13). Documented headers: `X-Automation-Timestamp` (unix
 * seconds), `X-Automation-Signature` (hex HMAC-SHA256 of
 * `${timestamp}.${rawBody}` using the automation's own secret),
 * `X-Automation-Delivery` (a caller-supplied unique ID used for replay
 * protection). Every check — signature, timestamp window, replay, size,
 * content-type, rate limit — genuinely runs inside `receiveWebhook`; this
 * route only extracts the raw body/headers and translates the safe,
 * public-facing result into an HTTP response. Never echoes back the secret,
 * the automation's internal ID, or a stack trace.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const rawBody = await request.text();

  const result = await receiveWebhook(publicId, rawBody, {
    timestamp: request.headers.get("x-automation-timestamp"),
    signature: request.headers.get("x-automation-signature"),
    deliveryId: request.headers.get("x-automation-delivery"),
    contentType: request.headers.get("content-type"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.errorCode ?? "WEBHOOK_INVALID" }, { status: result.status });
  }
  return NextResponse.json({ ok: true }, { status: result.status });
}

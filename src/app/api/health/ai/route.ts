import { NextResponse } from "next/server";
import { isAnthropicConfigured } from "@/lib/env/server";

// Forces this to run per-request on the Node.js runtime rather than being
// prerendered/cached — the whole point is to reflect the *current* runtime
// environment, not whatever was true at build time. See src/lib/env/server.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic endpoint: reports only whether ANTHROPIC_API_KEY is
 * configured for this deployment. Never returns the key, its length, or any
 * other derived secret data.
 */
export async function GET() {
  return NextResponse.json({ configured: isAnthropicConfigured() });
}

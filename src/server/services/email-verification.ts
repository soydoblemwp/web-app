import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  generateVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry,
  isVerificationTokenExpired,
} from "@/lib/auth/verification-token";
import { buildVerificationEmail } from "@/lib/email/verification-email";
import { sendEmail } from "@/lib/email/send-email";

/**
 * DB-backed operations for the email-verification flow — the pure token
 * math lives in src/lib/auth/verification-token.ts, reused here rather than
 * reimplemented. Every function re-derives its own authority from the
 * userId/token it's given; none trusts a caller-supplied "already verified"
 * flag or similar.
 */

export interface IssuedVerificationToken {
  rawToken: string;
  expiresAt: Date;
}

/** Issues a fresh token for `userId`, deleting any prior token(s) for that user first (same transaction) — at most one active token per user at a time, exactly as required for "reenvío invalida tokens anteriores". Returns the RAW token — the only place it ever exists outside the email itself; never persisted. */
export async function createEmailVerificationToken(userId: string): Promise<IssuedVerificationToken> {
  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = verificationTokenExpiry();

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } }),
  ]);

  return { rawToken, expiresAt };
}

/** When this user's most recent token was issued — null if none exists (never resent, or already verified and consumed). Used only to compute the resend cooldown; never exposed to the client directly. */
export async function getLatestVerificationTokenIssuedAt(userId: string): Promise<Date | null> {
  const row = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export type VerifyEmailTokenResult =
  | { status: "verified"; userId: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "already_used" };

/**
 * Consumes a raw token from a verification link. Looks it up by its hash
 * (never stores or compares the raw value) and, if valid, atomically marks
 * both the token as used AND the user as verified — the conditional
 * `updateMany({ where: { usedAt: null } })` inside the transaction is what
 * makes this race-safe: if the same link is opened twice at once, only the
 * first ever reports `verified`, the second correctly sees `already_used`,
 * and the account is never double-processed.
 */
export async function verifyEmailToken(rawToken: string): Promise<VerifyEmailTokenResult> {
  const tokenHash = hashVerificationToken(rawToken);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row) return { status: "invalid" };
  if (row.usedAt) return { status: "already_used" };
  if (isVerificationTokenExpired(row.expiresAt)) return { status: "expired" };

  const verifiedUserId = await prisma.$transaction(async (tx) => {
    const consumed = await tx.emailVerificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) return null; // lost a concurrent race — someone else just consumed this exact token
    await tx.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } });
    return row.userId;
  });

  if (!verifiedUserId) return { status: "already_used" };
  return { status: "verified", userId: verifiedUserId };
}

/**
 * Issues a token and attempts to deliver it. Never throws: if sending fails
 * (today, always — no email provider is configured, see
 * src/lib/email/send-email.ts), the token still exists in the database
 * exactly as if delivery had succeeded, so a working provider can be dropped
 * in later with zero changes to the registration/resend flows, and the
 * caller is never lied to about delivery — it gets `{ sent: false }` and is
 * expected to log/handle that itself, never to claim otherwise to the user.
 */
export async function sendVerificationEmailToUser(userId: string, email: string): Promise<{ sent: boolean }> {
  const { rawToken } = await createEmailVerificationToken(userId);
  try {
    await sendEmail(buildVerificationEmail(email, rawToken));
    return { sent: true };
  } catch (error) {
    console.error("[email-verification] No se pudo enviar el correo de verificación:", error instanceof Error ? error.message : error);
    return { sent: false };
  }
}

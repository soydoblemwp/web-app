"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { registerSchema } from "@/lib/validation/auth";
import { sendVerificationEmailToUser } from "@/server/services/email-verification";

export interface RegisterFormState {
  error?: string;
  success?: boolean;
}

export async function registerUser(
  _prevState: RegisterFormState,
  formData: FormData
): Promise<RegisterFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "Ya existe una cuenta con este correo electrónico." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // emailVerified stays NULL (the column's own default) — the account
  // cannot sign in (authorize() refuses it) or reach the dashboard
  // (proxy.ts/requireUser() refuse it) until the link below is used.
  const user = await prisma.user.create({
    data: { name, email: normalizedEmail, passwordHash },
  });

  // Never lets a delivery failure break registration — the account,
  // password, and a real, usable token all exist regardless; the
  // "revisa tu correo" screen's own "reenviar" action is the recovery path
  // either way (see src/lib/email/send-email.ts for why sending currently
  // always fails: no provider is configured yet).
  await sendVerificationEmailToUser(user.id, user.email);

  return { success: true };
}

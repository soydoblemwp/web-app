"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/auth";
import { isSafeRedirectTarget } from "@/lib/auth/safe-redirect";

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const requestedCallbackUrl = formData.get("callbackUrl");
  const redirectTo =
    typeof requestedCallbackUrl === "string" && isSafeRedirectTarget(requestedCallbackUrl)
      ? requestedCallbackUrl
      : "/dashboard";

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo,
    });
    return {};
  } catch (error) {
    // Only ever thrown from authorize() after the password has already
    // been verified correct — see src/lib/auth/config.ts. Checked before
    // the generic AuthError fallback below (CredentialsSignin extends
    // AuthError, so order matters) so this specific, non-sensitive reason
    // gets its own clear message instead of the generic one.
    if (error instanceof CredentialsSignin && error.code === "email_not_verified") {
      return { error: "Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada o solicita un nuevo enlace." };
    }
    if (error instanceof AuthError) {
      return { error: "Correo o contraseña incorrectos." };
    }
    throw error;
  }
}

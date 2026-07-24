"use server";

import { AuthError } from "next-auth";
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
    if (error instanceof AuthError) {
      return { error: "Correo o contraseña incorrectos." };
    }
    throw error;
  }
}

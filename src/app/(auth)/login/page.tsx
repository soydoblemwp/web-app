import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Iniciar sesión</h2>
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}

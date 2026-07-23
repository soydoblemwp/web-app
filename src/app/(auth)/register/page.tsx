import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Crear cuenta</h2>
      <RegisterForm />
    </div>
  );
}

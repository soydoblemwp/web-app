import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Política de cookies" };

export default function CookiesPage() {
  return (
    <LegalPage title="Política de cookies">
      <p>
        Utilizamos únicamente las cookies estrictamente necesarias para mantener tu sesión iniciada de forma
        segura. No utilizamos cookies de publicidad ni de rastreo de terceros.
      </p>
      <h2>Cookie de sesión</h2>
      <p>Gestionada por el sistema de autenticación para identificar tu sesión mientras usas la plataforma.</p>
    </LegalPage>
  );
}

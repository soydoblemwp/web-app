import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Términos de servicio" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos de servicio">
      <p>Al usar {appConfig.name} aceptas estos términos. Debes usar la plataforma de forma lícita y responsable.</p>
      <h2>Uso del servicio</h2>
      <ul>
        <li>No publicaremos contenido en tus redes sociales sin tu confirmación explícita.</li>
        <li>Eres responsable del contenido que generes y publiques a través de la plataforma.</li>
        <li>Los límites de uso dependen de tu plan de suscripción.</li>
      </ul>
      <h2>Disponibilidad</h2>
      <p>El servicio se ofrece &quot;tal cual&quot;, sin garantías de disponibilidad continua durante esta etapa temprana.</p>
      <h2>Cancelación</h2>
      <p>Puedes eliminar tu cuenta en cualquier momento desde la configuración de tu perfil.</p>
    </LegalPage>
  );
}

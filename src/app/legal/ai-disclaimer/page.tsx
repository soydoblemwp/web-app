import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Aviso sobre el uso de IA" };

export default function AIDisclaimerPage() {
  return (
    <LegalPage title="Aviso sobre el uso de inteligencia artificial">
      <p>
        Las funciones de IA de esta plataforma generan sugerencias y borradores. No garantizan resultados de
        posicionamiento SEO, ni constituyen asesoría legal, médica o financiera.
      </p>
      <h2>Revisión humana</h2>
      <p>
        Todo contenido generado por IA debe ser revisado por una persona antes de publicarse. La plataforma nunca
        publica ni envía contenido de forma automática sin confirmación, salvo automatizaciones configuradas
        explícitamente por ti.
      </p>
      <h2>Límites conocidos</h2>
      <p>
        Los modelos de IA pueden cometer errores o generar afirmaciones inexactas. Las puntuaciones SEO y los
        análisis de contenido combinan reglas deterministas con sugerencias de IA claramente diferenciadas.
      </p>
    </LegalPage>
  );
}

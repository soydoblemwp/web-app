import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad">
      <p>
        {appConfig.name} almacena los datos estrictamente necesarios para prestar el servicio: datos de cuenta,
        contenido de tus proyectos, historial de actividad y registros de uso de las funciones de IA.
      </p>
      <h2>Datos que recopilamos</h2>
      <ul>
        <li>Datos de la cuenta: nombre, correo electrónico, contraseña cifrada.</li>
        <li>Contenido creado dentro de la plataforma y metadatos asociados (proyecto, fechas, autor).</li>
        <li>Registros de uso de IA (tokens consumidos, modelo, fecha) sin almacenar contenido sensible innecesario.</li>
        <li>Credenciales de integraciones externas, siempre cifradas en reposo.</li>
      </ul>
      <h2>Con quién se comparte</h2>
      <p>
        El contenido que envíes al asistente de IA se procesa a través del proveedor de IA configurado. No se
        comparte con terceros para fines distintos a la prestación del servicio.
      </p>
      <h2>Tus derechos</h2>
      <p>Puedes exportar tus datos básicos y eliminar tu cuenta desde la configuración de tu perfil.</p>
    </LegalPage>
  );
}

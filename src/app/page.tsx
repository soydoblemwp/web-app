import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import {
  Bot,
  FileText,
  Search,
  Share2,
  CalendarDays,
  Megaphone,
  Radar,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import { appConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  { icon: Bot, title: "Asistente IA", description: "Chat contextual que conoce tu proyecto, tu marca y tu historial." },
  { icon: FileText, title: "Generador de contenido", description: "Artículos, emails, anuncios y más, con reglas de marca aplicadas." },
  { icon: Search, title: "Herramientas SEO", description: "Títulos, metadescripciones y análisis de claridad basados en reglas transparentes." },
  { icon: Share2, title: "Centro de redes sociales", description: "Publicaciones para 8 plataformas con estados y flujo de aprobación." },
  { icon: CalendarDays, title: "Calendario editorial", description: "Vista mensual, semanal y de lista con arrastrar y soltar." },
  { icon: Megaphone, title: "Campañas", description: "Planificación, pilares de contenido y seguimiento de resultados." },
  { icon: Radar, title: "Monitoreo y enlaces", description: "Vigilancia de páginas y verificación de enlaces con protección SSRF." },
  { icon: Workflow, title: "Automatizaciones", description: "Disparadores, condiciones y acciones con historial de ejecuciones." },
];

const plans = [
  { name: "Gratis", price: "0€", features: ["2 proyectos", "3 miembros", "50 generaciones de IA/mes"] },
  { name: "Creator", price: "—", features: ["Más proyectos", "Más miembros", "Más generaciones de IA"] },
  { name: "Pro", price: "—", features: ["Automatizaciones avanzadas", "Más integraciones", "Prioridad de soporte"] },
  { name: "Business", price: "—", features: ["Equipos grandes", "Límites ampliados", "Panel administrativo completo"] },
];

const faqs = [
  {
    q: "¿La IA publica contenido automáticamente?",
    a: "No. Ninguna publicación se envía sin que un integrante del equipo la confirme, salvo que configures explícitamente una automatización para ello.",
  },
  {
    q: "¿Qué pasa si una integración no está configurada?",
    a: "La función correspondiente se muestra como \"No configurada\", se explica qué credencial falta y las acciones dependientes quedan desactivadas. Nunca simulamos que una acción se completó.",
  },
  {
    q: "¿Los datos de SEO y analíticas son reales?",
    a: "Las puntuaciones SEO se calculan con reglas deterministas documentadas. Las analíticas de redes sociales muestran solo datos introducidos manualmente, importados o obtenidos por API — nunca estadísticas inventadas.",
  },
];

export default async function LandingPage() {
  // A signed-in visitor (any role) landing back on the public marketing page
  // — e.g. via the root URL or browser back — belongs in the app, not the
  // anonymous/guest entry point. Anonymous visitors are unaffected below.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">{appConfig.name}</span>
          <nav className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" render={<Link href="/guest">Continuar sin cuenta</Link>} />
            <Button variant="ghost" render={<Link href="/login">Iniciar sesión</Link>} />
            <Button render={<Link href="/register">Crear cuenta</Link>} />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Contenido, SEO, redes sociales y automatización en un solo lugar
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {appConfig.description} Un único producto modular: mismo sistema de usuarios, mismos proyectos, mismo
            historial.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" render={<Link href="/register">Empezar gratis</Link>} />
            <Button size="lg" variant="outline" render={<Link href="/login">Ya tengo cuenta</Link>} />
            <Button size="lg" variant="outline" render={<Link href="/guest">Continuar sin cuenta</Link>} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sin registro puedes probar las herramientas básicas al momento. Tu contenido se conserva solo durante
            esta sesión del navegador, no en tu cuenta ni de forma permanente.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">Módulos principales</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((m) => (
              <Card key={m.title}>
                <CardHeader>
                  <m.icon className="mb-2 size-6 text-primary" />
                  <CardTitle className="text-base">{m.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{m.description}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-12">
          <Card className="border-dashed">
            <CardContent className="flex items-start gap-3 py-6">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Principio de honestidad: no mostramos datos de demostración como si fueran reales, no afirmamos
                integraciones conectadas cuando no lo están y no publicamos ni respondemos en tu nombre sin
                confirmación.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">Planes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card key={plan.name}>
                <CardHeader>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <p className="text-2xl font-semibold">{plan.price}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Los precios de los planes de pago se confirmarán al integrar la facturación. El plan Gratis ya está
            disponible.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <Card key={faq.q}>
                <CardHeader>
                  <CardTitle className="text-base">{faq.q}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{faq.a}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>
            © {new Date().getFullYear()} {appConfig.name}
          </span>
          <nav className="flex gap-4">
            <Link href="/legal/privacy" className="hover:underline">
              Privacidad
            </Link>
            <Link href="/legal/terms" className="hover:underline">
              Términos
            </Link>
            <Link href="/legal/cookies" className="hover:underline">
              Cookies
            </Link>
            <Link href="/legal/ai-disclaimer" className="hover:underline">
              Aviso sobre IA
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

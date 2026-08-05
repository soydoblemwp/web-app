import type { Metadata } from "next";
import Link from "next/link";
import { appConfig } from "@/lib/config";
import { getAllPublicTools, getFeaturedPublicTools, getNewPublicTools, getNonEmptyPublicToolCategories } from "@/lib/public-tools/registry";
import { ToolsExplorer } from "@/components/public-tools/tools-explorer";
import { PublicToolCard } from "@/components/public-tools/public-tool-card";

export const metadata: Metadata = {
  title: "Herramientas gratuitas de empleo, negocios, organización y productividad",
  description:
    "109 herramientas gratuitas y sin registro: YAML/XML/TOML, formateador SQL y web, JSON Schema, JWT, HMAC, CSP, cabeceras de seguridad, subredes IP, análisis de URL, currículum, calculadora científica, préstamos, audio, video, PDF y más.",
  alternates: { canonical: `${appConfig.url}/herramientas` },
  openGraph: {
    title: "Herramientas gratuitas — " + appConfig.name,
    description: "Herramientas gratuitas de cálculo, finanzas, tiempo, productividad, audio, video, subtítulos, grabación, PDF, imágenes, seguridad y desarrollo. Sin registro.",
    url: `${appConfig.url}/herramientas`,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Herramientas gratuitas — " + appConfig.name,
    description: "Herramientas gratuitas de cálculo, finanzas, tiempo, productividad, audio, video, subtítulos, grabación, PDF, imágenes, seguridad y desarrollo. Sin registro.",
  },
};

export default async function PublicToolsCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  const tools = getAllPublicTools();
  const featured = getFeaturedPublicTools();
  const newTools = getNewPublicTools();
  const categories = getNonEmptyPublicToolCategories();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav aria-label="Ruta de navegación" className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Herramientas</span>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Herramientas gratuitas</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {tools.length} herramientas de empleo, negocios, organización, imprimibles, cálculo, finanzas, tiempo,
        productividad, generadores, educación, comparación, audio, video, subtítulos, grabación, PDF, imágenes,
        privacidad, seguridad, desarrollo, conversores, calculadoras, SEO técnico, diseño web, texto y redes
        sociales. Sin registro, sin tarjeta y sin límites artificiales de prueba — cada una indica claramente
        dónde procesa tus datos.
      </p>

      {newTools.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Nuevas</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newTools.map((tool) => (
              <PublicToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      ) : null}

      {featured.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Destacadas</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((tool) => (
              <PublicToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Todas las herramientas</h2>
        <div className="mt-3">
          <ToolsExplorer tools={tools} categories={categories} initialCategory={categoria} />
        </div>
      </section>

      <div className="mt-10 border-t pt-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}

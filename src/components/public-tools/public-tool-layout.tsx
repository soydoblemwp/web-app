import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolIcon } from "@/components/public-tools/tool-icon";
import { ProcessingBadge, PrivacyNotice } from "@/components/public-tools/processing-badge";
import { PublicToolCard } from "@/components/public-tools/public-tool-card";
import { getRelatedPublicTools, getPublicToolCategory } from "@/lib/public-tools/registry";
import type { PublicToolDefinition } from "@/lib/public-tools/types";

/**
 * Shared shell every public tool page renders through — breadcrumb, title,
 * description, processing badge, the tool's own interactive UI (passed as
 * children), privacy note, use cases, how-to steps, FAQ, and related tools.
 * Individual tools are free to structure their own form/result area however
 * fits (spec section 25: "no fuerces a todas las herramientas a usar
 * exactamente el mismo formulario") — this shell only standardizes the
 * surrounding chrome and copy, not the interaction itself.
 */
export function PublicToolLayout({ tool, children }: { tool: PublicToolDefinition; children: React.ReactNode }) {
  const category = getPublicToolCategory(tool.category);
  const relatedTools = getRelatedPublicTools(tool.slug);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <nav aria-label="Ruta de navegación" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/herramientas" className="hover:underline">
          Herramientas
        </Link>
        {category ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/herramientas?categoria=${category.slug}`} className="hover:underline">
              {category.label}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{tool.name}</span>
      </nav>

      <div className="mb-4 flex items-start gap-3">
        <ToolIcon icon={tool.icon} className="mt-1 size-8 shrink-0 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tool.longDescription}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ProcessingBadge executionType={tool.executionType} />
        {tool.limitsSummary ? (
          <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{tool.limitsSummary}</span>
        ) : null}
      </div>

      <div className="space-y-6">{children}</div>

      <div className="mt-8">
        <PrivacyNotice executionType={tool.executionType} hasFiles={Boolean(tool.acceptedFileTypes)} category={tool.category} slug={tool.slug} />
      </div>

      {tool.useCases.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Casos de uso</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {tool.useCases.map((useCase) => (
              <li key={useCase}>{useCase}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tool.howToUse.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Cómo utilizar esta herramienta</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {tool.howToUse.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {tool.faq.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-3 space-y-3">
            {tool.faq.map((entry) => (
              <Card key={entry.question}>
                <CardHeader>
                  <CardTitle className="text-sm">{entry.question}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{entry.answer}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {relatedTools.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Herramientas relacionadas</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relatedTools.map((related) => (
              <PublicToolCard key={related.slug} tool={related} compact />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-10 border-t pt-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}

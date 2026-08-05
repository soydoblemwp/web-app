import { appConfig } from "@/lib/config";
import type { PublicToolDefinition } from "@/lib/public-tools/types";

/**
 * Renders only the structured data explicitly allowed by spec section 29:
 * WebApplication/SoftwareApplication, BreadcrumbList, and FAQPage — and only
 * when that FAQ is genuinely visible on the page. Never adds ratings,
 * review counts, or usage numbers (spec: "no añadas puntuaciones ni reseñas
 * inventadas").
 */
export function ToolStructuredData({ tool }: { tool: PublicToolDefinition }) {
  const url = `${appConfig.url}/herramientas/${tool.slug}`;

  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": tool.schemaType,
    name: tool.name,
    description: tool.longDescription,
    url,
    applicationCategory: "UtilityApplication",
    operatingSystem: "Any (navegador web)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: appConfig.url },
      { "@type": "ListItem", position: 2, name: "Herramientas", item: `${appConfig.url}/herramientas` },
      { "@type": "ListItem", position: 3, name: tool.name, item: url },
    ],
  };

  const faqJsonLd =
    tool.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: tool.faq.map((entry) => ({
            "@type": "Question",
            name: entry.question,
            acceptedAnswer: { "@type": "Answer", text: entry.answer },
          })),
        }
      : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {faqJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} /> : null}
    </>
  );
}

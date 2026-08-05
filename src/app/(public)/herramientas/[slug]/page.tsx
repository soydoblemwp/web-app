import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appConfig } from "@/lib/config";
import { findPublicTool, getAllPublicTools } from "@/lib/public-tools/registry";
import { PublicToolLayout } from "@/components/public-tools/public-tool-layout";
import { ToolStructuredData } from "@/components/public-tools/structured-data";
import { renderToolComponent, RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

export function generateStaticParams() {
  return getAllPublicTools().map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = findPublicTool(slug);
  if (!tool) return {};

  const url = `${appConfig.url}/herramientas/${tool.slug}`;
  return {
    title: tool.metadata.title,
    description: tool.metadata.description,
    keywords: tool.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: tool.metadata.title,
      description: tool.metadata.description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: tool.metadata.title,
      description: tool.metadata.description,
    },
  };
}

export default async function PublicToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = findPublicTool(slug);
  if (!tool || tool.status !== "available") notFound();
  if (!RENDERABLE_TOOL_SLUGS.includes(slug as (typeof RENDERABLE_TOOL_SLUGS)[number])) notFound();

  return (
    <PublicToolLayout tool={tool}>
      <ToolStructuredData tool={tool} />
      {renderToolComponent(slug)}
    </PublicToolLayout>
  );
}

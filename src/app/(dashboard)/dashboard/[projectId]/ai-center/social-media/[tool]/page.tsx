import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { getSocialMediaTool } from "@/lib/ai-center/tools/social-media";
import { AiGenerationForm } from "@/components/ai-center/generation/ai-generation-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; tool: string }>;
}): Promise<Metadata> {
  const { tool: toolSegment } = await params;
  const tool = getSocialMediaTool(toolSegment);
  return { title: tool ? tool.label : "Social Media AI" };
}

export default async function SocialMediaToolPage({
  params,
}: {
  params: Promise<{ projectId: string; tool: string }>;
}) {
  const { projectId, tool: toolSegment } = await params;
  const tool = getSocialMediaTool(toolSegment);
  if (!tool) notFound();

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const brandContextText = buildBrandContext(project, brandKit);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tool.label}</h1>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      </div>
      <AiGenerationForm tool={tool} projectId={projectId} brandContextText={brandContextText} />
    </div>
  );
}

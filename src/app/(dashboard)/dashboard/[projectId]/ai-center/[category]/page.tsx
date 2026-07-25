import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getAiCategory } from "@/lib/ai-center/registry";
import { listFavoriteToolSlugs } from "@/server/services/ai-center";
import { ToolGrid } from "@/components/ai-center/tool-grid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const found = getAiCategory(category);
  return { title: found ? found.label : "AI Center" };
}

export default async function AiCenterCategoryPage({
  params,
}: {
  params: Promise<{ projectId: string; category: string }>;
}) {
  const { projectId, category: categorySlug } = await params;
  const category = getAiCategory(categorySlug);
  if (!category) notFound();

  const user = await getCurrentUser();
  const favoriteSlugs = user ? await listFavoriteToolSlugs(user.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{category.label}</h1>
        <p className="text-sm text-muted-foreground">{category.description}</p>
      </div>
      <ToolGrid tools={category.tools} projectId={projectId} favoriteSlugs={new Set(favoriteSlugs)} />
    </div>
  );
}

import type { AiTool } from "@/lib/ai-center/types";
import { ToolCard } from "@/components/ai-center/tool-card";

export function ToolGrid({
  tools,
  projectId,
  favoriteSlugs,
}: {
  tools: AiTool[];
  projectId: string;
  favoriteSlugs: Set<string>;
}) {
  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground">Próximamente.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} projectId={projectId} isFavorite={favoriteSlugs.has(tool.slug)} />
      ))}
    </div>
  );
}

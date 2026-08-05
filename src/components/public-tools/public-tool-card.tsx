import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolIcon } from "@/components/public-tools/tool-icon";
import type { PublicToolDefinition } from "@/lib/public-tools/types";

const EXECUTION_LABEL: Record<PublicToolDefinition["executionType"], string> = {
  DETERMINISTIC: "Sin IA",
  LOCAL_AI: "IA local",
  HYBRID: "Híbrida",
  LOCAL_MEDIA: "Multimedia local",
  LOCAL_RECORDING: "Grabación local",
};

export function PublicToolCard({ tool, compact = false }: { tool: PublicToolDefinition; compact?: boolean }) {
  return (
    <Card className="h-full transition-colors hover:border-primary/50">
      <Link href={`/herramientas/${tool.slug}`} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <ToolIcon icon={tool.icon} className="size-6 text-primary" />
            <div className="flex gap-1">
              {tool.isNew ? (
                <Badge variant="default" className="text-[0.65rem]">
                  Nueva
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[0.65rem]">
                {EXECUTION_LABEL[tool.executionType]}
              </Badge>
            </div>
          </div>
          <CardTitle className="text-base">{tool.name}</CardTitle>
        </CardHeader>
        {compact ? null : (
          <CardContent className="text-sm text-muted-foreground">{tool.shortDescription}</CardContent>
        )}
      </Link>
    </Card>
  );
}

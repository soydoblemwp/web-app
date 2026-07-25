"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import type { AiTool } from "@/lib/ai-center/types";
import { toggleAiToolFavoriteAction, recordAiToolUsageAction } from "@/server/actions/ai-center";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ToolCard({
  tool,
  projectId,
  isFavorite,
}: {
  tool: AiTool;
  projectId: string;
  isFavorite: boolean;
}) {
  const [favorite, setFavorite] = useState(isFavorite);
  const isAvailable = tool.status === "available" && typeof tool.href === "function";

  function handleToggleFavorite(event: React.MouseEvent) {
    event.preventDefault();
    setFavorite((prev) => !prev);
    void toggleAiToolFavoriteAction(projectId, tool.slug);
  }

  const card = (
    <Card className={isAvailable ? "h-full transition-shadow hover:shadow-md" : "h-full opacity-60"}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{tool.label}</span>
          {isAvailable ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              onClick={handleToggleFavorite}
            >
              <Star className={favorite ? "size-4 fill-primary text-primary" : "size-4"} />
            </Button>
          ) : (
            <Badge variant="outline">Próximamente</Badge>
          )}
        </CardTitle>
        <CardDescription>{tool.description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (!isAvailable) {
    return <div aria-disabled="true">{card}</div>;
  }

  return (
    <Link href={tool.href!(projectId)} onClick={() => void recordAiToolUsageAction(projectId, tool.slug)}>
      {card}
    </Link>
  );
}

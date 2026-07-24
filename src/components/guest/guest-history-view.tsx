"use client";

import { useEffect, useState } from "react";
import { listRecentHistory } from "@/lib/guest-storage/history";
import { listLocalProjects } from "@/lib/guest-storage/projects";
import type { LocalLibraryItem, LocalProject } from "@/lib/guest-storage/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const KIND_LABELS: Record<LocalLibraryItem["kind"], string> = {
  CONTENT: "Contenido",
  SOCIAL_IDEAS: "Ideas",
  ADAPTATION: "Adaptación",
  REPLY: "Respuesta",
  OTHER: "Otro",
};

export function GuestHistoryView() {
  const [items, setItems] = useState<LocalLibraryItem[]>([]);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [history, projectList] = await Promise.all([listRecentHistory(100), listLocalProjects()]);
      setItems(history);
      setProjects(projectList);
      setIsLoading(false);
    })();
  }, []);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando historial...</p>;
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no has generado ni guardado nada.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
            <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
            <Badge variant="secondary">{projectNameById.get(item.projectId) ?? "Proyecto eliminado"}</Badge>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()}
            </span>
          </CardHeader>
          <CardContent>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

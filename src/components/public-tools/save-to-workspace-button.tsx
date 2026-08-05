"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWorkspaceSaveContextAction, saveToolResultToWorkspaceAction } from "@/server/actions/public-tools";

/**
 * "Crea una cuenta para guardar este resultado" invitation for a visitor who
 * isn't signed in, or a project picker + save action for one who is (spec
 * section 22 — the result itself is always already visible; this is purely
 * an optional follow-up, never a gate).
 */
export function SaveToWorkspaceButton({ title, body, sourceTool }: { title: string; body: string; sourceTool: string }) {
  const [context, setContext] = useState<{ authenticated: boolean; projects: { id: string; name: string }[] } | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void getWorkspaceSaveContextAction().then((result) => {
      setContext(result);
      if (result.projects[0]) setProjectId(result.projects[0].id);
    });
  }, []);

  if (!context) return null;

  if (!context.authenticated) {
    return (
      <p className="text-xs text-muted-foreground">
        <Link href="/register" className="underline">
          Crea una cuenta
        </Link>{" "}
        para guardar este resultado en tu espacio de trabajo.
      </p>
    );
  }

  if (context.projects.length === 0) {
    return <p className="text-xs text-muted-foreground">Crea un proyecto en tu cuenta para poder guardar resultados aquí.</p>;
  }

  if (savedId) {
    return (
      <p className="text-xs text-muted-foreground">
        Guardado en tu Workspace.{" "}
        <Link href={`/dashboard/${projectId}/workspace?result=${savedId}`} className="underline">
          Abrir
        </Link>
      </p>
    );
  }

  if (!expanded) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
        <Save className="size-3.5" /> Guardar en tu Workspace
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={projectId} onValueChange={(value) => setProjectId(value ?? undefined)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Elige un proyecto" />
        </SelectTrigger>
        <SelectContent>
          {context.projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        disabled={!projectId || isPending}
        onClick={() => {
          if (!projectId) return;
          startTransition(async () => {
            const result = await saveToolResultToWorkspaceAction(projectId, { title, body, sourceTool });
            if (result.error) {
              toast.error(result.error);
              return;
            }
            setSavedId(result.id ?? null);
            toast.success("Resultado guardado en tu Workspace.");
          });
        }}
      >
        Confirmar
      </Button>
    </div>
  );
}

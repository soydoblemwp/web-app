import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, LayoutTemplate, Fingerprint, Waypoints } from "lucide-react";
import { listContentItems } from "@/server/services/content";
import { mapContentItemToWorkspaceResult, resolveHighlightId } from "@/lib/ai-workspace/types";
import { AiWorkspaceHub } from "@/components/workspace/ai-workspace-hub";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Workspace IA" };

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const items = await listContentItems(projectId, {});
  const results = items.map(mapContentItemToWorkspaceResult);

  // listContentItems is already scoped to this projectId, so resolveHighlightId
  // can only ever match a result that truly belongs here — an id from another
  // project, or one that doesn't exist, resolves to null and is ignored.
  const highlightId = resolveHighlightId(results, query.result);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace IA</h1>
          <p className="text-sm text-muted-foreground">
            Historial universal de resultados generados por cualquier herramienta de IA de este proyecto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            render={
              <Link href={`/dashboard/${projectId}/prompt-library`}>
                <BookMarked className="size-3.5" /> Prompt Library
              </Link>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            render={
              <Link href={`/dashboard/${projectId}/ai-templates`}>
                <LayoutTemplate className="size-3.5" /> AI Templates
              </Link>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            render={
              <Link href={`/dashboard/${projectId}/brand-kits`}>
                <Fingerprint className="size-3.5" /> Brand Kits
              </Link>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            render={
              <Link href={`/dashboard/${projectId}/ai-workflows`}>
                <Waypoints className="size-3.5" /> AI Workflows
              </Link>
            }
          />
        </div>
      </div>
      <AiWorkspaceHub projectId={projectId} results={results} highlightId={highlightId} />
    </div>
  );
}

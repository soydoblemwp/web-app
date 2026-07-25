import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listWorkflowsForUser } from "@/server/services/ai-workflows";
import { WorkflowHub } from "@/components/ai-workflows/workflow-hub";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Workflows" };

export default async function AiWorkflowsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const workflows = await listWorkflowsForUser(user.id, projectId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Construye secuencias reutilizables de pasos que encadenan herramientas, prompts, templates y tu Brand
            Kit. Puedes simular la ejecución sin consumir IA, o ejecutarla de verdad con el motor de IA real.
          </p>
        </div>
        <Link href={`/dashboard/${projectId}/ai-workflows/analytics`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <BarChart3 className="size-3.5" /> Analytics
        </Link>
      </div>
      <Suspense fallback={null}>
        <WorkflowHub projectId={projectId} workflows={workflows} />
      </Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listEligibleWorkflowsForAutomationAction, listAutomationEventDefinitionsAction } from "@/server/actions/automation-select";
import { AutomationForm } from "@/components/automations/automation-form";

export const metadata: Metadata = { title: "Nueva automatización" };

export default async function NewAutomationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const [workflows, eventDefinitions] = await Promise.all([listEligibleWorkflowsForAutomationAction(projectId), listAutomationEventDefinitionsAction()]);

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/automations`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Automation Center
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva automatización</h1>
        <p className="text-sm text-muted-foreground">Se crea como borrador — actívala cuando termines de configurarla.</p>
      </div>

      {workflows.length === 0 ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          No tienes ningún workflow publicado en este proyecto todavía. Publica un workflow en AI Workflows antes de crear una automatización.
        </p>
      ) : (
        <AutomationForm projectId={projectId} workflows={workflows.map((w) => ({ id: w.id, name: w.name, variables: w.variables }))} eventDefinitions={eventDefinitions} />
      )}
    </div>
  );
}

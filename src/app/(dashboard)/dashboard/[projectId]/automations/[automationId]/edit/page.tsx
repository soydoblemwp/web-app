import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getAutomationAction } from "@/server/actions/automations";
import { listEligibleWorkflowsForAutomationAction, listAutomationEventDefinitionsAction } from "@/server/actions/automation-select";
import { AutomationForm, type AutomationFormInitial } from "@/components/automations/automation-form";
import type { ConditionGroupInput, InputMappingInput } from "@/lib/validation/automations";

export const metadata: Metadata = { title: "Editar automatización" };

export default async function EditAutomationPage({ params }: { params: Promise<{ projectId: string; automationId: string }> }) {
  const { projectId, automationId } = await params;
  await requireProjectAccess(projectId, "EDITOR");

  const [automation, workflows, eventDefinitions] = await Promise.all([
    getAutomationAction(projectId, automationId),
    listEligibleWorkflowsForAutomationAction(projectId),
    listAutomationEventDefinitionsAction(),
  ]);
  if (!automation) notFound();

  function toGroupInput(g: NonNullable<typeof automation>["conditionGroups"][number]): ConditionGroupInput {
    return {
      operator: g.operator,
      conditions: g.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value as string | number | boolean | null | undefined })),
      groups: (g.childGroups ?? []).map((cg) => toGroupInput(cg as never)),
    };
  }
  const rootGroup = automation.conditionGroups[0];

  const initial: AutomationFormInitial = {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    workflowId: automation.workflowId,
    trigger: automation.trigger ? { type: automation.trigger.type, config: (automation.trigger.config as Record<string, unknown>) ?? {} } : { type: "MANUAL", config: {} },
    conditions: rootGroup ? toGroupInput(rootGroup) : null,
    inputMappings: automation.inputMappings.map((m): InputMappingInput => ({ targetVariable: m.targetVariable, sourceKind: m.sourceKind as InputMappingInput["sourceKind"], sourceExpression: m.sourceExpression, transform: m.transform as InputMappingInput["transform"], defaultValue: m.defaultValue })),
    errorPolicy: automation.errorPolicy,
    maxRetryAttempts: automation.maxRetryAttempts,
    requireApprovalBeforeStart: automation.requireApprovalBeforeStart,
    notifyOnCompletion: automation.notifyOnCompletion,
    notifyOnFailure: automation.notifyOnFailure,
    timezone: automation.timezone,
  };

  const workflowOptions = workflows.some((w) => w.id === automation.workflowId)
    ? workflows
    : [{ id: automation.workflow.id, name: automation.workflow.name, variables: automation.workflow.variables, publishedVersion: automation.workflow.publishedVersion }, ...workflows];

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/automations/${automationId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {automation.name}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar automatización</h1>
      </div>
      <AutomationForm projectId={projectId} workflows={workflowOptions.map((w) => ({ id: w.id, name: w.name, variables: w.variables }))} eventDefinitions={eventDefinitions} initial={initial} />
    </div>
  );
}

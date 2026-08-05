"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { listEventDefinitions } from "@/lib/automations/events";
import { WORKFLOW_AUTOMATION_TRIGGER_TYPES } from "@/lib/automations/types";

/** Workflows this user can attach an automation to — only published, non-archived ones (an automation can't drive a workflow with nothing to run). */
export async function listEligibleWorkflowsForAutomationAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const rows = await prisma.workflow.findMany({
    where: { userId: user.id, OR: [{ projectId }, { projectId: null }], status: { not: "ARCHIVED" }, activeRevisionId: { not: null } },
    select: { id: true, name: true, variables: true, publishedVersion: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows;
}

export async function listWorkflowRevisionsForAutomationAction(projectId: string, workflowId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.projectId !== projectId) return [];
  return prisma.workflowRevision.findMany({
    where: { workflowId },
    select: { id: true, version: true, createdAt: true },
    orderBy: { version: "desc" },
  });
}

export async function listAutomationEventDefinitionsAction() {
  return listEventDefinitions().map((def) => ({ key: def.key, label: def.label, description: def.description, resourceType: def.resourceType, fields: def.fields }));
}

export async function listAutomationTriggerTypesAction() {
  return WORKFLOW_AUTOMATION_TRIGGER_TYPES;
}

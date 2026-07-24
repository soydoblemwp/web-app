import { getGuestDB } from "./db";
import { checkMonitorNow } from "./monitors";
import type { LocalAutomation, LocalAutomationAction, LocalAutomationRun, LocalAutomationTrigger } from "./types";

export interface SaveAutomationInput {
  projectId: string;
  name: string;
  trigger: LocalAutomationTrigger;
  action: LocalAutomationAction;
  message?: string;
  monitorId?: string | null;
}

export async function listAutomationsByProject(projectId: string): Promise<LocalAutomation[]> {
  const db = await getGuestDB();
  const automations = await db.getAllFromIndex("automations", "projectId", projectId);
  return automations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createAutomation(input: SaveAutomationInput): Promise<LocalAutomation> {
  const db = await getGuestDB();
  const now = new Date().toISOString();
  const automation: LocalAutomation = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: input.name.trim().slice(0, 200) || "Automatización sin nombre",
    trigger: input.trigger,
    action: input.action,
    message: input.message?.trim() ?? "",
    monitorId: input.monitorId ?? null,
    isEnabled: true,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("automations", automation);
  return automation;
}

export async function setAutomationEnabled(id: string, isEnabled: boolean): Promise<LocalAutomation | undefined> {
  const db = await getGuestDB();
  const existing = await db.get("automations", id);
  if (!existing) return undefined;
  const updated: LocalAutomation = { ...existing, isEnabled, updatedAt: new Date().toISOString() };
  await db.put("automations", updated);
  return updated;
}

export async function deleteAutomation(id: string): Promise<void> {
  const db = await getGuestDB();
  await db.delete("automations", id);
}

export async function listAutomationRuns(automationId: string): Promise<LocalAutomationRun[]> {
  const db = await getGuestDB();
  const runs = await db.getAllFromIndex("automationRuns", "automationId", automationId);
  return runs.sort((a, b) => b.runAt.localeCompare(a.runAt));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function isDue(automation: LocalAutomation, now: Date): boolean {
  if (!automation.isEnabled) return false;
  if (automation.trigger === "MANUAL") return false;
  if (!automation.lastRunAt) return true;
  const elapsed = now.getTime() - new Date(automation.lastRunAt).getTime();
  if (automation.trigger === "SCHEDULE_DAILY") return elapsed >= DAY_MS;
  if (automation.trigger === "SCHEDULE_WEEKLY") return elapsed >= WEEK_MS;
  return false;
}

async function executeAutomation(automation: LocalAutomation): Promise<string> {
  if (automation.action === "CREATE_REMINDER") {
    return automation.message || `Recordatorio: revisa "${automation.name}".`;
  }
  if (automation.action === "CHECK_MONITOR" && automation.monitorId) {
    const result = await checkMonitorNow(automation.monitorId);
    if (!result) return `No se encontró el monitor asociado a "${automation.name}".`;
    if (result.status === "CHANGED") return `Se detectaron cambios en ${result.url}.`;
    if (result.status === "ERROR") return `No se pudo comprobar ${result.url}: ${result.lastError ?? "error desconocido"}.`;
    return `Sin cambios en ${result.url}.`;
  }
  return `Automatización "${automation.name}" ejecutada.`;
}

/**
 * Runs every due automation for a project. Must only ever be called while
 * the app is open (e.g. on mount of the guest automations/layout screen) —
 * there is no cron, no server function, and no background execution.
 */
export async function runDueAutomations(projectId: string): Promise<LocalAutomationRun[]> {
  const db = await getGuestDB();
  const automations = await listAutomationsByProject(projectId);
  const now = new Date();
  const runs: LocalAutomationRun[] = [];

  for (const automation of automations) {
    if (!isDue(automation, now)) continue;
    const message = await executeAutomation(automation);
    const run: LocalAutomationRun = {
      id: crypto.randomUUID(),
      automationId: automation.id,
      projectId,
      message,
      runAt: now.toISOString(),
    };
    await db.put("automationRuns", run);
    await db.put("automations", { ...automation, lastRunAt: now.toISOString(), updatedAt: now.toISOString() });
    runs.push(run);
  }

  return runs;
}

/** Runs a single automation immediately, regardless of its schedule — used by the "Ejecutar ahora" button. */
export async function runAutomationNow(automationId: string): Promise<LocalAutomationRun | undefined> {
  const db = await getGuestDB();
  const automation = await db.get("automations", automationId);
  if (!automation) return undefined;

  const now = new Date();
  const message = await executeAutomation(automation);
  const run: LocalAutomationRun = {
    id: crypto.randomUUID(),
    automationId: automation.id,
    projectId: automation.projectId,
    message,
    runAt: now.toISOString(),
  };
  await db.put("automationRuns", run);
  await db.put("automations", { ...automation, lastRunAt: now.toISOString(), updatedAt: now.toISOString() });
  return run;
}

import { beforeEach, describe, expect, it } from "vitest";
import { _resetGuestDBForTests } from "@/lib/guest-storage/db";
import { createLocalProject } from "@/lib/guest-storage/projects";
import { createAutomation, runAutomationNow, runDueAutomations } from "@/lib/guest-storage/automations";

async function resetDB() {
  await _resetGuestDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("ai-content-hub-guest");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await resetDB();
});

describe("local automations only run when explicitly invoked (i.e. when the app is open)", () => {
  it("a never-run daily automation is due and executes on the first runDueAutomations() call", async () => {
    const project = await createLocalProject({ name: "P" });
    await createAutomation({ projectId: project.id, trigger: "SCHEDULE_DAILY", action: "CREATE_REMINDER", name: "Diaria", message: "Revisa el calendario" });

    const runs = await runDueAutomations(project.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].message).toBe("Revisa el calendario");
  });

  it("does not re-run a daily automation the same day it already ran", async () => {
    const project = await createLocalProject({ name: "P" });
    await createAutomation({ projectId: project.id, trigger: "SCHEDULE_DAILY", action: "CREATE_REMINDER", name: "Diaria" });

    const firstPass = await runDueAutomations(project.id);
    expect(firstPass).toHaveLength(1);

    // Calling it again immediately simulates re-opening the app moments
    // later — must not run twice in the same day.
    const secondPass = await runDueAutomations(project.id);
    expect(secondPass).toHaveLength(0);
  });

  it("never executes a MANUAL-trigger automation automatically — only via runAutomationNow()", async () => {
    const project = await createLocalProject({ name: "P" });
    const automation = await createAutomation({ projectId: project.id, trigger: "MANUAL", action: "CREATE_REMINDER", name: "Manual", message: "hola" });

    const due = await runDueAutomations(project.id);
    expect(due).toHaveLength(0);

    const manualRun = await runAutomationNow(automation.id);
    expect(manualRun?.message).toBe("hola");
  });

  it("skips disabled automations even if their schedule is due", async () => {
    const project = await createLocalProject({ name: "P" });
    const automation = await createAutomation({ projectId: project.id, trigger: "SCHEDULE_DAILY", action: "CREATE_REMINDER", name: "Deshabilitada" });
    const { setAutomationEnabled } = await import("@/lib/guest-storage/automations");
    await setAutomationEnabled(automation.id, false);

    const due = await runDueAutomations(project.id);
    expect(due).toHaveLength(0);
  });

  it("this module never imports a cron/server/Vercel-functions API — deterministic and local only", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/guest-storage/automations.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/node-cron|vercel\/cron|"use server"|next\/server/i);
  });
});

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Square, RotateCcw, Save, CircleDot, CheckCircle2, XCircle, MinusCircle, WifiOff, History as HistoryIcon } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import {
  startWorkflowRunAction,
  testDraftWorkflowRunAction,
  prepareWorkflowStepAction,
  completeWorkflowStepAction,
  failWorkflowStepAction,
  cancelWorkflowRunAction,
  retryWorkflowRunAction,
  resumeWorkflowRunAction,
  renewWorkflowRunLeaseAction,
  findRecoverableWorkflowRunAction,
  saveWorkflowRunResultToWorkspaceAction,
  type WorkflowRunStepSummary,
  type RecoverableRunView,
} from "@/server/actions/workflow-execution";
import { WORKFLOW_LEASE } from "@/lib/ai-workflows/lease";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ClientStepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";

interface ClientStepState extends WorkflowRunStepSummary {
  status: ClientStepStatus;
  output?: string;
  error?: string;
  attemptNumber?: number;
  /** Set only for a "workflow" step (SubWorkflow) while/after its child run is being driven — its own nested progress, rendered recursively. */
  childRun?: {
    runId: string;
    workflowId: string;
    workflowName: string;
    steps: ClientStepState[];
  };
}

type StepsUpdater = (updater: (prev: ClientStepState[]) => ClientStepState[]) => void;

type DriveRunResult =
  | { status: "completed"; output?: string }
  | { status: "failed"; error: string }
  | { status: "cancelled" };

type OverallStatus =
  | "idle"
  | "checking"
  | "confirming"
  | "confirming-resume"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "blocked-other-tab"
  | "disconnected";

/** Which real execution flavor is being confirmed/run — "published" is the stable, production execution; "draft_test" ("Probar borrador") runs the current, possibly-unpublished draft and is never confused with it in the UI or in WorkflowRun.executionMode. */
type RunMode = "published" | "draft_test";

const STEP_STATUS_ICON: Record<ClientStepStatus, React.ReactNode> = {
  pending: <MinusCircle className="size-4 text-muted-foreground" />,
  running: <CircleDot className="size-4 animate-pulse text-primary" />,
  completed: <CheckCircle2 className="size-4 text-emerald-600" />,
  failed: <XCircle className="size-4 text-destructive" />,
  skipped: <MinusCircle className="size-4 text-muted-foreground" />,
  cancelled: <MinusCircle className="size-4 text-muted-foreground" />,
};

function toClientStatus(serverStatus: string): ClientStepStatus {
  switch (serverStatus) {
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function newOpaqueId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Stable per-tab identity for lease arbitration UI only — never trusted for authorization (the server's leaseId + ownership checks are). Survives a same-tab reload (sessionStorage) so a refresh can recognize "this is still me," but a new tab always gets its own. */
function getTabId(workflowId: string): string {
  if (typeof window === "undefined") return newOpaqueId();
  const key = `wf-lease-tab:${workflowId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = newOpaqueId();
  window.sessionStorage.setItem(key, created);
  return created;
}

function newIdempotencyKey(): string {
  return newOpaqueId();
}

function mergeRecoveredSteps(summaries: WorkflowRunStepSummary[], recovery: RecoverableRunView): ClientStepState[] {
  return summaries.map((s) => {
    const known = recovery.steps.find((r) => r.stepId === s.stepId);
    return {
      ...s,
      status: known ? toClientStatus(known.status) : "pending",
      output: known?.output ?? undefined,
      error: known?.errorMessage ?? undefined,
      attemptNumber: known?.attemptNumber,
    };
  });
}

/**
 * Renders one run's step list, recursing into any "workflow" step's nested
 * childRun at increasing indentation — the same real progress UI at every
 * nesting level, since it's the same real engine driving all of them.
 */
function WorkflowStepRows({
  runId,
  steps,
  saving,
  onSave,
  depth,
}: {
  runId: string | null;
  steps: ClientStepState[];
  saving: string | null;
  onSave: (runId: string, stepIndex: number, stepId: string) => void;
  depth: number;
}) {
  return (
    <div className={depth > 0 ? "space-y-2 border-l-2 pl-3" : "space-y-2"}>
      {steps.map((step, index) => (
        <div key={step.stepId} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {STEP_STATUS_ICON[step.status]}
              <span className="font-medium">
                Paso {index + 1}: {step.label}
              </span>
              {step.attemptNumber && step.attemptNumber > 1 ? (
                <Badge variant="outline" className="text-[10px]">
                  Intento {step.attemptNumber}
                </Badge>
              ) : null}
            </div>
            {step.status === "completed" && step.output && runId ? (
              <Button type="button" variant="ghost" size="sm" disabled={saving === step.stepId} onClick={() => onSave(runId, index, step.stepId)}>
                <Save className="size-3.5" /> Guardar
              </Button>
            ) : null}
          </div>
          {step.error ? <p className="text-xs text-destructive">{step.error}</p> : null}
          {step.childRun ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Sub-workflow: <span className="font-medium">{step.childRun.workflowName}</span>
              </p>
              <WorkflowStepRows runId={step.childRun.runId} steps={step.childRun.steps} saving={saving} onSave={onSave} depth={depth + 1} />
            </div>
          ) : null}
          {step.status === "completed" && step.output ? (
            <div className="rounded-md bg-muted/30 p-2">
              <UniversalResultViewer blocks={parseResultBlocks(step.output)} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * "Ejecutar workflow" — REAL execution. Unlike WorkflowRunPanel (the
 * preview, which never leaves the pure planWorkflowRun engine), this
 * component drives the server-orchestrated run step by step against its own
 * frozen snapshot: each "ai_tool" step's system/user prompt comes back from
 * prepareWorkflowStepAction, and this component sends it through the exact
 * same useLocalAI hook every AI Center tool already uses — never a second
 * engine, never a fabricated result. A lightweight DB-backed lease (no
 * WebSockets, no queue) ensures only this tab drives the run at a time; a
 * reload or lost connection never silently re-runs a completed step — the
 * database, not this component's state, is what a reload trusts.
 */
export function WorkflowExecutionPanel({
  projectId,
  workflowId,
  workflowName,
  publishedVersion,
  variables,
}: {
  projectId: string;
  workflowId: string;
  workflowName: string;
  /** The Workflow's currently active PUBLISHED version — null when it has never been published, in which case "Ejecutar workflow" is disabled (only "Probar borrador" is available). */
  publishedVersion: number | null;
  variables: string[];
}) {
  const ai = useLocalAI();
  const tabIdRef = useRef<string>(getTabId(workflowId));
  const [values, setValues] = useState<Record<string, string>>({});
  const [overallStatus, setOverallStatus] = useState<OverallStatus>("checking");
  const [pendingMode, setPendingMode] = useState<RunMode>("published");
  const [activeRunMode, setActiveRunMode] = useState<RunMode | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runVersion, setRunVersion] = useState<number | null>(null);
  const [steps, setSteps] = useState<ClientStepState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // "final" | stepId | null
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [recovery, setRecovery] = useState<RecoverableRunView | null>(null);
  const cancelledRef = useRef(false);
  const leaseIdRef = useRef<string | null>(null);
  const resumeOriginRef = useRef<OverallStatus>("interrupted");
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Every run currently being actively driven, root first — a "workflow" step keeps its PARENT run's lease idle for the whole time its child runs, so the heartbeat must renew every level, not just the top one. */
  const activeRunStackRef = useRef<{ runId: string; leaseId: string }[]>([]);

  const hasPublishedVersion = publishedVersion !== null;

  const finalOutput = steps.length > 0 ? steps[steps.length - 1]?.output : undefined;
  const finalBlocks = parseResultBlocks(finalOutput ?? "");

  // Detect a recoverable (non-terminal) run for this workflow on mount — the
  // database is always consulted fresh; nothing here is read from
  // localStorage/sessionStorage/React state left over from before a reload.
  useEffect(() => {
    let cancelled = false;
    findRecoverableWorkflowRunAction(projectId, workflowId, tabIdRef.current).then((view) => {
      if (cancelled) return;
      if (!view) {
        setOverallStatus("idle");
        return;
      }
      setRecovery(view);
      setRunId(view.runId);
      setRunVersion(view.workflowVersion);
      setActiveRunMode(view.executionMode === "DRAFT_TEST" ? "draft_test" : "published");
      if (view.isLeaseHeldByOtherTab) setOverallStatus("blocked-other-tab");
      else if (view.status === "INTERRUPTED") setOverallStatus("interrupted");
      else setOverallStatus("interrupted"); // RUNNING/PENDING/VALIDATING with no valid lease of mine — same "needs an explicit resume" treatment
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, workflowId]);

  // Online/offline — never marks anything completed or starts a new step
  // while offline; only surfaces the state and requires an explicit resume.
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
      if (overallStatus === "running") {
        cancelledRef.current = true;
        setOverallStatus("disconnected");
      }
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [overallStatus]);

  // Heartbeat: renews the lease while a run is actively executing so a long
  // AI generation between prepare and complete doesn't outlive it.
  useEffect(() => {
    if (overallStatus !== "running" || !runId || !leaseIdRef.current) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = setInterval(async () => {
      // Renew every level currently in flight (the top-level run plus any
      // SubWorkflow run(s) nested inside it) — a long-running child would
      // otherwise leave its ancestors' leases un-renewed for the whole time.
      const active = activeRunStackRef.current;
      if (active.length === 0) return;
      const results = await Promise.all(active.map((r) => renewWorkflowRunLeaseAction({ projectId, runId: r.runId, leaseId: r.leaseId })));
      const failed = results.find((r) => r.error);
      if (failed) {
        cancelledRef.current = true;
        setOverallStatus("blocked-other-tab");
        setErrorMessage(failed.error ?? null);
      }
    }, WORKFLOW_LEASE.HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [overallStatus, runId, projectId]);

  /**
   * Drives ONE run (root or a nested SubWorkflow child) step by step —
   * exactly the same logic regardless of nesting level, reusing the exact
   * same useLocalAI engine instance for every "ai_tool" step no matter how
   * deep. A "workflow" step's prepare call returns `subWorkflow` bootstrap
   * info instead of a prompt or a final value; this function then recurses
   * into the child run (pushing it onto activeRunStackRef so the heartbeat
   * keeps its lease — and every ancestor's — alive for as long as it takes),
   * and once the child finishes, reports its final output back as THIS
   * step's own result via the existing complete/fail actions. Never a second
   * execution engine: the recursion is entirely in this one client function.
   */
  async function driveRun(runId: string, leaseId: string, initialSteps: ClientStepState[], setStepsFn: StepsUpdater): Promise<DriveRunResult> {
    let workingSteps = [...initialSteps];
    function updateLocalStep(index: number, patch: Partial<ClientStepState>) {
      workingSteps = workingSteps.map((s, i) => (i === index ? { ...s, ...patch } : s));
      setStepsFn((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    }

    activeRunStackRef.current = [...activeRunStackRef.current, { runId, leaseId }];
    try {
      for (let i = 0; i < initialSteps.length; i++) {
        if (cancelledRef.current) return { status: "cancelled" };
        // A step already resolved from a previous attempt (resumed run) is
        // never re-executed — only genuinely PENDING steps get prepared.
        if (initialSteps[i].status !== "pending") continue;

        updateLocalStep(i, { status: "running" });
        const prepared = await prepareWorkflowStepAction({ projectId, runId, stepIndex: i, leaseId });

        if (cancelledRef.current) return { status: "cancelled" };

        if (prepared.error) {
          updateLocalStep(i, { status: "failed", error: prepared.error });
          return { status: "failed", error: prepared.error };
        }

        if (prepared.subWorkflow) {
          const sub = prepared.subWorkflow;
          // A resumed (not brand-new) child run may already have some steps
          // COMPLETED from before a disconnect — those must never be
          // re-driven, exactly like mergeRecoveredSteps for a top-level run.
          const childInitial: ClientStepState[] = sub.resumedSteps
            ? sub.steps.map((s) => {
                const known = sub.resumedSteps!.find((r) => r.stepId === s.stepId);
                return {
                  ...s,
                  status: known ? toClientStatus(known.status) : "pending",
                  output: known?.output ?? undefined,
                  error: known?.errorMessage ?? undefined,
                  attemptNumber: known?.attemptNumber,
                };
              })
            : sub.steps.map((s) => ({ ...s, status: "pending" as const }));
          updateLocalStep(i, { childRun: { runId: sub.runId, workflowId: sub.workflowId, workflowName: sub.workflowName, steps: childInitial } });

          const childSetter: StepsUpdater = (updater) =>
            setStepsFn((prev) =>
              prev.map((s, idx) => (idx === i && s.childRun ? { ...s, childRun: { ...s.childRun, steps: updater(s.childRun.steps) } } : s))
            );
          const childResult = await driveRun(sub.runId, sub.leaseId, childInitial, childSetter);

          if (cancelledRef.current) return { status: "cancelled" };

          if (childResult.status !== "completed") {
            const message = childResult.status === "failed" ? childResult.error : "El sub-workflow se canceló.";
            await failWorkflowStepAction({ projectId, runId, stepIndex: i, errorMessage: message, leaseId, executionToken: prepared.executionToken ?? "" });
            updateLocalStep(i, { status: "failed", error: message });
            return { status: "failed", error: message };
          }

          const completed = await completeWorkflowStepAction({
            projectId,
            runId,
            stepIndex: i,
            output: childResult.output ?? "",
            leaseId,
            executionToken: prepared.executionToken ?? "",
          });
          if (completed.error) {
            updateLocalStep(i, { status: "failed", error: completed.error });
            return { status: "failed", error: completed.error };
          }
          updateLocalStep(i, { status: "completed", output: completed.output });
          continue;
        }

        if (prepared.done) {
          updateLocalStep(i, { status: "completed", output: prepared.output });
          continue;
        }

        // ai_tool step: generate for real, through the one existing local engine.
        const text = await ai.generate({ system: prepared.systemPrompt ?? "", prompt: prepared.userPrompt ?? "" });

        if (cancelledRef.current) return { status: "cancelled" };

        if (!text) {
          const message = ai.error ?? "La generación se canceló o falló.";
          await failWorkflowStepAction({
            projectId,
            runId,
            stepIndex: i,
            errorMessage: message,
            leaseId,
            executionToken: prepared.executionToken ?? "",
          });
          updateLocalStep(i, { status: "failed", error: message });
          return { status: "failed", error: message };
        }

        const completed = await completeWorkflowStepAction({
          projectId,
          runId,
          stepIndex: i,
          output: text,
          leaseId,
          executionToken: prepared.executionToken ?? "",
        });
        if (completed.error) {
          updateLocalStep(i, { status: "failed", error: completed.error });
          return { status: "failed", error: completed.error };
        }
        updateLocalStep(i, { status: "completed", output: completed.output });
      }

      return { status: "completed", output: workingSteps[workingSteps.length - 1]?.output };
    } finally {
      activeRunStackRef.current = activeRunStackRef.current.filter((r) => r.runId !== runId);
    }
  }

  async function runLoop(startedRunId: string, leaseId: string, initialSteps: ClientStepState[]) {
    try {
      const result = await driveRun(startedRunId, leaseId, initialSteps, setSteps);
      if (cancelledRef.current) return;
      if (result.status === "completed") setOverallStatus("completed");
      else if (result.status === "failed") {
        setOverallStatus("failed");
        setErrorMessage(result.error);
      }
    } catch {
      // A thrown exception here can only be a genuine network failure — the
      // server is still the source of truth for whatever already completed;
      // this tab just lost the ability to keep driving the run and must
      // explicitly reconnect and resume, never silently mark anything done.
      if (!cancelledRef.current) {
        cancelledRef.current = true;
        setOverallStatus("disconnected");
      }
    }
  }

  async function handleConfirmExecute() {
    cancelledRef.current = false;
    setErrorMessage(null);
    setOverallStatus("running");
    setRecovery(null);
    setActiveRunMode(pendingMode);

    const action = pendingMode === "draft_test" ? testDraftWorkflowRunAction : startWorkflowRunAction;
    const started = await action({
      projectId,
      workflowId,
      idempotencyKey: idempotencyKeyRef.current,
      inputVariables: values,
      leaseOwner: tabIdRef.current,
    });

    if (started.error || !started.runId || !started.steps || !started.leaseId) {
      setOverallStatus("failed");
      setErrorMessage(started.error ?? "No se pudo iniciar la ejecución.");
      return;
    }

    setRunId(started.runId);
    setRunVersion(publishedVersion);
    leaseIdRef.current = started.leaseId;
    const initialSteps: ClientStepState[] = started.steps.map((s) => ({ ...s, status: "pending" }));
    setSteps(initialSteps);

    await runLoop(started.runId, started.leaseId, initialSteps);
  }

  async function handleConfirmResume() {
    if (!runId) return;
    cancelledRef.current = false;
    setErrorMessage(null);
    setOverallStatus("running");

    const resumed = await resumeWorkflowRunAction({ projectId, runId, leaseOwner: tabIdRef.current });
    if (resumed.error || !resumed.runId || !resumed.steps || !resumed.leaseId) {
      setOverallStatus(recovery?.isLeaseHeldByOtherTab ? "blocked-other-tab" : "failed");
      setErrorMessage(resumed.error ?? "No se pudo reanudar la ejecución.");
      return;
    }

    leaseIdRef.current = resumed.leaseId;
    const initialSteps = recovery ? mergeRecoveredSteps(resumed.steps, recovery) : resumed.steps.map((s) => ({ ...s, status: "pending" as const }));
    setSteps(initialSteps);
    setRecovery(null);

    await runLoop(resumed.runId, resumed.leaseId, initialSteps);
  }

  async function handleCancel() {
    cancelledRef.current = true;
    ai.cancel();
    // Cancel every run currently in flight — the top-level run plus any
    // SubWorkflow run(s) nested inside it — so a cancel mid-child never
    // leaves an orphaned RUNNING child behind.
    const activeRunIds = new Set([...(runId ? [runId] : []), ...activeRunStackRef.current.map((r) => r.runId)]);
    await Promise.all([...activeRunIds].map((id) => cancelWorkflowRunAction(projectId, id)));
    activeRunStackRef.current = [];
    setSteps((prev) => prev.map((s) => (s.status === "pending" || s.status === "running" ? { ...s, status: "cancelled" } : s)));
    setOverallStatus("cancelled");
    setRecovery(null);
  }

  async function handleRetry(useCurrentVersion: boolean) {
    if (!runId) return;
    idempotencyKeyRef.current = newIdempotencyKey();
    cancelledRef.current = false;
    setErrorMessage(null);
    setOverallStatus("running");
    setRecovery(null);

    const retried = await retryWorkflowRunAction({
      projectId,
      runId,
      idempotencyKey: idempotencyKeyRef.current,
      leaseOwner: tabIdRef.current,
      useCurrentVersion,
    });
    if (retried.error || !retried.runId || !retried.steps || !retried.leaseId) {
      setOverallStatus("failed");
      setErrorMessage(retried.error ?? "No se pudo reintentar la ejecución.");
      return;
    }

    setRunId(retried.runId);
    setRunVersion(useCurrentVersion ? publishedVersion : runVersion);
    // "Ejecutar versión actual" always means the current PUBLISHED revision
    // (never the draft) — a replayed original snapshot keeps whatever mode
    // that original run already had.
    if (useCurrentVersion) setActiveRunMode("published");
    leaseIdRef.current = retried.leaseId;
    const initialSteps: ClientStepState[] = retried.steps.map((s) => ({ ...s, status: "pending" }));
    setSteps(initialSteps);
    await runLoop(retried.runId, retried.leaseId, initialSteps);
  }

  async function handleSaveFinal() {
    if (!runId) return;
    setSaving("final");
    const result = await saveWorkflowRunResultToWorkspaceAction({ projectId, runId });
    setSaving(null);
    if (result.error) toast.error(result.error);
    else toast.success("Resultado final guardado en el Workspace.");
  }

  async function handleSaveStep(targetRunId: string, stepIndex: number, stepId: string) {
    setSaving(stepId);
    const result = await saveWorkflowRunResultToWorkspaceAction({ projectId, runId: targetRunId, stepIndex });
    setSaving(null);
    if (result.error) toast.error(result.error);
    else toast.success("Resultado del paso guardado en el Workspace.");
  }

  const busy = overallStatus === "running";
  const canExecute =
    overallStatus === "idle" || overallStatus === "completed" || overallStatus === "failed" || overallStatus === "cancelled";
  const canRetry = (overallStatus === "failed" || overallStatus === "cancelled") && runId;
  const nextPendingIndex = steps.findIndex((s) => s.status === "pending");
  const lastCompleted = [...steps].reverse().find((s) => s.status === "completed");

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
          activeRunMode === "draft_test" ? "border-amber-500/50 bg-amber-500/5" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        {activeRunMode === "draft_test" ? (
          <Badge variant="secondary">Prueba de borrador</Badge>
        ) : (
          <Badge variant="destructive">Ejecución real (publicada)</Badge>
        )}
        <Badge variant="outline">{hasPublishedVersion ? `Versión publicada: v${publishedVersion}` : "Sin publicar"}</Badge>
        {!online ? (
          <Badge variant="outline" className="gap-1">
            <WifiOff className="size-3" /> Sin conexión
          </Badge>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {activeRunMode === "draft_test"
            ? "Ejecuta el borrador actual sin publicarlo. Llama al motor de IA de verdad y consume cuota."
            : "Ejecuta la versión publicada. Llama al motor de IA de verdad y consume cuota."}{" "}
          Usa &quot;Simular ejecución&quot; para probar sin generar nada.
        </p>
      </div>

      {!hasPublishedVersion ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Este workflow todavía no tiene ninguna versión publicada — publícalo para habilitar &quot;Ejecutar workflow&quot;. Mientras tanto puedes usar
          &quot;Probar borrador&quot;.
        </p>
      ) : null}

      {overallStatus === "checking" ? <p className="text-sm text-muted-foreground">Comprobando ejecuciones pendientes...</p> : null}

      {recovery && (overallStatus === "interrupted" || overallStatus === "blocked-other-tab") ? (
        <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-sm font-medium">
            {recovery.status === "INTERRUPTED" ? "Ejecución interrumpida" : "Hay una ejecución en curso de este workflow"}
          </p>
          <p className="text-xs text-muted-foreground">
            {recovery.interruptionReason ?? "Se detectó una ejecución que quedó sin control activo."} Versión usada: v
            {recovery.workflowVersion}
            {recovery.workflowChangedSinceRun ? ` (el Workflow actual está en v${recovery.currentWorkflowVersion} — cambió desde entonces)` : ""}.
          </p>
          <p className="text-xs text-muted-foreground">
            Pasos completados: {recovery.steps.filter((s) => s.status === "COMPLETED").length} de {recovery.steps.length}.{" "}
            {recovery.nextPendingStepIndex >= 0 ? `Siguiente paso pendiente: ${recovery.nextPendingStepIndex + 1}.` : ""}
          </p>
          {recovery.isLeaseHeldByOtherTab ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Otra pestaña tiene el control activo de esta ejecución ahora mismo.</p>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                resumeOriginRef.current = overallStatus;
                setOverallStatus("confirming-resume");
              }}
            >
              <RotateCcw className="size-3.5" /> Reanudar ejecución
            </Button>
          )}
        </div>
      ) : null}

      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este workflow no tiene variables de entrada.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {variables.map((name) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={`exec-var-${workflowId}-${name}`}>{`{{${name}}}`}</Label>
              <Input
                id={`exec-var-${workflowId}-${name}`}
                value={values[name] ?? ""}
                disabled={busy}
                onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {overallStatus === "confirming" ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">
            {pendingMode === "draft_test"
              ? <>¿Probar el borrador actual de &quot;{workflowName}&quot; con el motor de IA real?</>
              : <>¿Ejecutar la versión publicada de &quot;{workflowName}&quot; con el motor de IA real?</>}
          </p>
          <p className="text-xs text-muted-foreground">
            Esta acción consumirá cuota de generación por cada paso de IA.{" "}
            {pendingMode === "draft_test" ? "No modifica la versión publicada ni requiere publicar." : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleConfirmExecute}>
              Confirmar y {pendingMode === "draft_test" ? "probar borrador" : "ejecutar"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOverallStatus("idle")}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canExecute || !hasPublishedVersion}
            onClick={() => {
              setPendingMode("published");
              setOverallStatus("confirming");
            }}
          >
            <Play className="size-3.5" /> Ejecutar workflow
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canExecute}
            onClick={() => {
              setPendingMode("draft_test");
              setOverallStatus("confirming");
            }}
          >
            <Play className="size-3.5" /> Probar borrador
          </Button>
          {busy ? (
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              <Square className="size-3.5" /> Cancelar ejecución
            </Button>
          ) : null}
          {canRetry ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => handleRetry(false)}>
                <HistoryIcon className="size-3.5" /> Reintentar (snapshot original)
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!hasPublishedVersion} onClick={() => handleRetry(true)}>
                <RotateCcw className="size-3.5" /> Ejecutar versión actual (v{publishedVersion})
              </Button>
            </>
          ) : null}
        </div>
      )}

      {overallStatus === "disconnected" ? (
        <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-sm font-medium">Se perdió la conexión durante la ejecución</p>
          <p className="text-xs text-muted-foreground">
            Los pasos ya confirmados por el servidor están a salvo. No se inició ningún paso nuevo. Reanuda cuando vuelva la conexión.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!online}
            onClick={() => {
              resumeOriginRef.current = "disconnected";
              setOverallStatus("confirming-resume");
            }}
          >
            <RotateCcw className="size-3.5" /> Reconectar y reanudar
          </Button>
        </div>
      ) : null}

      {overallStatus === "confirming-resume" ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">¿Reanudar la ejecución con el motor de IA real?</p>
          <p className="text-xs text-muted-foreground">
            Continúa desde el siguiente paso pendiente y puede seguir consumiendo cuota de generación por cada paso de IA restante.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleConfirmResume}>
              Confirmar y reanudar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOverallStatus(resumeOriginRef.current)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <LocalAIStatusPanel ai={ai} />

      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

      {steps.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Progreso</p>
            {runVersion !== null ? <Badge variant="outline">Ejecutado con v{runVersion}</Badge> : null}
            {lastCompleted ? <Badge variant="secondary">Último completado: paso {steps.indexOf(lastCompleted) + 1}</Badge> : null}
            {nextPendingIndex >= 0 ? <Badge variant="outline">Siguiente pendiente: paso {nextPendingIndex + 1}</Badge> : null}
          </div>
          <WorkflowStepRows runId={runId} steps={steps} saving={saving} onSave={handleSaveStep} depth={0} />
        </div>
      ) : null}

      {overallStatus === "completed" && finalOutput ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Resultado final</p>
          <div className="rounded-lg border bg-muted/30 p-3">
            <UniversalResultViewer blocks={finalBlocks} />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={saving === "final"} onClick={handleSaveFinal}>
            <Save className="size-3.5" /> {saving === "final" ? "Guardando..." : "Guardar en Workspace"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

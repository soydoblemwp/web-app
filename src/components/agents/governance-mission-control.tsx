"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldAlert, ShieldOff, Pause, Play, Ban, CheckCircle2, XCircle, FlaskConical, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { formatDateTime } from "@/components/automations/labels";
import { PolicyRuleEditor, type RuleDraft } from "@/components/agents/policy-rule-editor";
import { PolicyStudio } from "@/components/agents/policy-studio";
import {
  setProjectPausedAction,
  setEmergencyStopAction,
  decideGovernanceApprovalAction,
  cancelGovernanceApprovalAction,
  listGovernedRunsAction,
  getRunGovernanceDetailAction,
  createPolicyDraftAction,
  activatePolicyVersionAction,
  archivePolicyVersionAction,
  restorePolicyVersionAction,
  previewPolicyConflictsAction,
  requestPolicyChangeApprovalAction,
  simulateGovernancePolicyAction,
} from "@/server/actions/agent-governance";

const RISK_LEVELS = ["READ_ONLY", "DRAFT_WRITE", "INTERNAL_MUTATION", "EXTERNAL_SIDE_EFFECT"] as const;
const OPERATION_TYPES = ["CREATE_RUN", "PREPARE_STEP", "COMPLETE_WRITE", "RETRY", "RESUME"] as const;

const DECISION_TONE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  ALLOW: "secondary",
  DENY: "destructive",
  REQUIRE_APPROVAL: "outline",
};

interface OverviewData {
  policy: { id: string; version: number; limits: Record<string, unknown> } | null;
  state: { projectPaused: boolean; emergencyStopEnabled: boolean; pausedAgentRefs: string[] };
  concurrency: { active: number; maxProject: number };
  statusCounts: { status: string; count: number }[];
  deniedCount: number;
  requireApprovalCount: number;
  recentRuns: { id: string; status: string; agentRef: string; createdAt: string; completedAt: string | null }[];
  pendingApprovals: { id: string; agentRef: string; mode: string | null; riskLevel: string; requestedBy: { id: string; name: string | null; email: string }; createdAt: string; expiresAt: string | null }[];
  recentDecisions: { id: string; runId: string; decision: string; code: string; reason: string; riskLevel: string; evaluatedAt: string }[];
  budgets: { metric: string; window: string; limit: number | null; reserved: number; consumed: number; available: number | null }[];
  agentsWithMostFailures: { agentRef: string; failures: number }[];
}

interface PolicyVersionRow {
  id: string;
  version: number;
  status: string;
  comment: string | null;
  maxRiskLevel: string;
  createdAt: string;
  activatedAt: string | null;
  archivedAt: string | null;
  createdBy: { id: string; name: string | null; email: string };
}

export function GovernanceMissionControl({
  projectId,
  isManager,
  overview,
  policyVersions,
}: {
  projectId: string;
  isManager: boolean;
  overview: OverviewData;
  policyVersions: PolicyVersionRow[];
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Resumen</TabsTrigger>
        <TabsTrigger value="runs">Ejecuciones</TabsTrigger>
        <TabsTrigger value="approvals">Aprobaciones</TabsTrigger>
        {isManager ? <TabsTrigger value="policy">Política</TabsTrigger> : null}
        {isManager ? <TabsTrigger value="policy-studio">Policy Studio</TabsTrigger> : null}
        {isManager ? <TabsTrigger value="simulation">Simulación</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab projectId={projectId} isManager={isManager} overview={overview} />
      </TabsContent>
      <TabsContent value="runs" className="mt-4">
        <RunsTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="approvals" className="mt-4">
        <ApprovalsTab projectId={projectId} isManager={isManager} approvals={overview.pendingApprovals} />
      </TabsContent>
      {isManager ? (
        <TabsContent value="policy" className="mt-4">
          <PolicyTab projectId={projectId} versions={policyVersions} />
        </TabsContent>
      ) : null}
      {isManager ? (
        <TabsContent value="policy-studio" className="mt-4">
          <PolicyStudio projectId={projectId} versions={policyVersions} />
        </TabsContent>
      ) : null}
      {isManager ? (
        <TabsContent value="simulation" className="mt-4">
          <SimulationTab projectId={projectId} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ projectId, isManager, overview }: { projectId: string; isManager: boolean; overview: OverviewData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<"pause" | "resume" | "emergencyOn" | "emergencyOff" | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>) {
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ejecuciones activas" value={`${overview.concurrency.active} / ${overview.concurrency.maxProject}`} />
        <StatCard label="Denegadas (histórico reciente)" value={String(overview.deniedCount)} tone={overview.deniedCount > 0 ? "warn" : "default"} />
        <StatCard label="Requieren aprobación" value={String(overview.requireApprovalCount)} tone={overview.requireApprovalCount > 0 ? "warn" : "default"} />
        <StatCard label="Política activa" value={overview.policy ? `v${overview.policy.version}` : "Ninguna"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" /> Estado de control
          </CardTitle>
          <CardDescription>Pausa de nuevas ejecuciones y parada de emergencia — nunca cancelan ejecuciones activas automáticamente ni alteran el historial.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={overview.state.projectPaused ? "destructive" : "secondary"}>{overview.state.projectPaused ? "Nuevas ejecuciones pausadas" : "Nuevas ejecuciones activas"}</Badge>
          <Badge variant={overview.state.emergencyStopEnabled ? "destructive" : "secondary"}>{overview.state.emergencyStopEnabled ? "Parada de emergencia ACTIVA" : "Sin parada de emergencia"}</Badge>
          {overview.state.pausedAgentRefs.length > 0 ? <Badge variant="outline">{overview.state.pausedAgentRefs.length} agente(s) pausado(s)</Badge> : null}

          {isManager ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmAction(overview.state.projectPaused ? "resume" : "pause")}>
                {overview.state.projectPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {overview.state.projectPaused ? "Reanudar ejecuciones" : "Pausar nuevas ejecuciones"}
              </Button>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmAction(overview.state.emergencyStopEnabled ? "emergencyOff" : "emergencyOn")}>
                <ShieldOff className="size-3.5" />
                {overview.state.emergencyStopEnabled ? "Desactivar emergencia" : "Activar parada de emergencia"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Presupuesto (ventana diaria/mensual)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.budgets.every((b) => b.limit === null) ? (
              <p className="text-sm text-muted-foreground">Sin límites de presupuesto configurados — se muestra únicamente el consumo real.</p>
            ) : null}
            {overview.budgets.map((b) => (
              <div key={`${b.metric}-${b.window}`} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {b.metric} ({b.window})
                </span>
                <span>
                  {b.reserved + b.consumed}
                  {b.limit !== null ? ` / ${b.limit}` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agentes con más fallos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {overview.agentsWithMostFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin fallos registrados.</p>
            ) : (
              overview.agentsWithMostFailures.map((a) => (
                <div key={a.agentRef} className="flex items-center justify-between text-sm">
                  <span>{a.agentRef}</span>
                  <Badge variant="outline">{a.failures}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas decisiones de gobernanza</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.recentDecisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay decisiones registradas.</p>
          ) : (
            overview.recentDecisions.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={DECISION_TONE[d.decision] ?? "outline"}>{d.decision}</Badge>
                <span className="text-muted-foreground">{d.code}</span>
                <span className="flex-1 truncate">{d.reason}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(d.evaluatedAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmAction === "pause"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Pausar nuevas ejecuciones"
        description="No se cancelarán las ejecuciones ya activas. Solo se bloquearán las nuevas ejecuciones de agentes en este proyecto hasta que reanudes."
        confirmLabel="Pausar"
        destructive
        onConfirm={() => run(() => setProjectPausedAction(projectId, { paused: true }))}
      />
      <ConfirmDialog
        open={confirmAction === "resume"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Reanudar nuevas ejecuciones"
        description="Se permitirá de nuevo crear e iniciar ejecuciones de agentes en este proyecto."
        confirmLabel="Reanudar"
        onConfirm={() => run(() => setProjectPausedAction(projectId, { paused: false }))}
      />
      <ConfirmDialog
        open={confirmAction === "emergencyOn"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Activar parada de emergencia"
        description="Bloquea inmediatamente nuevas ejecuciones, reintentos y reanudaciones. No cancela ejecuciones activas ni elimina historial — solo impide avanzar."
        confirmLabel="Activar emergencia"
        destructive
        onConfirm={() => run(() => setEmergencyStopAction(projectId, { enabled: true }))}
      />
      <ConfirmDialog
        open={confirmAction === "emergencyOff"}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Desactivar parada de emergencia"
        description="Las ejecuciones nuevas, reintentos y reanudaciones volverán a evaluarse normalmente contra la política activa."
        confirmLabel="Desactivar"
        onConfirm={() => run(() => setEmergencyStopAction(projectId, { enabled: false }))}
      />
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

interface RunRow {
  id: string;
  status: string;
  createdAt: string;
  officialAgentKey: string | null;
  customAgentId: string | null;
  teamId: string | null;
  governanceSnapshot: { decision: string; code: string; riskLevel: string } | null;
}

function RunsTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<string>("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(reset: boolean) {
    setLoading(true);
    try {
      const result = await listGovernedRunsAction(projectId, {
        limit: 20,
        cursor: reset ? undefined : (cursor ?? undefined),
        decision: decisionFilter === "ALL" ? undefined : decisionFilter,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const mapped = (result.runs as unknown as RunRow[]).map((r) => ({ ...r }));
      setRows(reset ? mapped : [...(rows ?? []), ...mapped]);
      setCursor(result.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred a microtask so the initial setLoading(true) never runs synchronously inside the
    // effect body itself (React docs: avoid calling setState directly within an effect).
    void Promise.resolve().then(() => load(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={decisionFilter}
          onValueChange={(v) => {
            if (!v) return;
            setDecisionFilter(v);
            setRows(null);
            setCursor(null);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las decisiones</SelectItem>
            <SelectItem value="ALLOW">Permitidas</SelectItem>
            <SelectItem value="DENY">Denegadas</SelectItem>
            <SelectItem value="REQUIRE_APPROVAL">Requieren aprobación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows === null || rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{loading ? "Cargando…" : "No hay ejecuciones que coincidan con este filtro."}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 10)}</span>
                <span>{r.officialAgentKey ?? r.customAgentId ?? r.teamId ?? "—"}</span>
                <Badge variant="outline">{r.status}</Badge>
                {r.governanceSnapshot ? <Badge variant={DECISION_TONE[r.governanceSnapshot.decision] ?? "outline"}>{r.governanceSnapshot.decision}</Badge> : <Badge variant="outline">sin evaluar</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {cursor ? (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load(false)}>
          Cargar más
        </Button>
      ) : null}

      {detailId ? <RunDetailDialog projectId={projectId} runId={detailId} onClose={() => setDetailId(null)} /> : null}
    </div>
  );
}

function RunDetailDialog({ projectId, runId, onClose }: { projectId: string; runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null | "error">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRunGovernanceDetailAction(projectId, runId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setErrorMsg(result.error ?? "No se pudo cargar el detalle de gobernanza.");
        setDetail("error");
      } else {
        setDetail(result.detail as unknown as Record<string, unknown>);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  const snapshot = detail && detail !== "error" ? (detail.governanceSnapshot as Record<string, unknown> | null) : null;

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Detalle de gobernanza de la ejecución"
      description={errorMsg ?? (snapshot ? String(snapshot.reason) : "Esta ejecución todavía no tiene una decisión de gobernanza registrada (creada antes de activar Fase 37, o gobernanza no aplicó).")}
      confirmLabel="Cerrar"
      onConfirm={onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

function ApprovalsTab({ projectId, isManager, approvals }: { projectId: string; isManager: boolean; approvals: OverviewData["pendingApprovals"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState<Record<string, string>>({});

  function decide(id: string, decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await decideGovernanceApprovalAction(projectId, { approvalId: id, decision, comment: comment[id] });
      if (result && "error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }
  function cancel(id: string) {
    startTransition(async () => {
      const result = await cancelGovernanceApprovalAction(projectId, id);
      if (result && "error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  if (approvals.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No hay solicitudes de aprobación pendientes.</p>;
  }

  return (
    <div className="space-y-3">
      {approvals.map((a) => (
        <Card key={a.id}>
          <CardContent className="space-y-2 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.agentRef}</span>
              {a.mode ? <Badge variant="outline">{a.mode}</Badge> : null}
              <Badge variant="outline">{a.riskLevel}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                Solicitado por {a.requestedBy.name ?? a.requestedBy.email} · {formatDateTime(a.createdAt)}
              </span>
            </div>
            {a.expiresAt ? <p className="text-xs text-muted-foreground">Expira: {formatDateTime(a.expiresAt)}</p> : null}
            {isManager ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input placeholder="Comentario (opcional)" value={comment[a.id] ?? ""} onChange={(e) => setComment((c) => ({ ...c, [a.id]: e.target.value }))} className="max-w-xs" />
                <Button size="sm" disabled={pending} onClick={() => decide(a.id, "APPROVED")}>
                  <CheckCircle2 className="size-3.5" /> Aprobar
                </Button>
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => decide(a.id, "REJECTED")}>
                  <XCircle className="size-3.5" /> Rechazar
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(a.id)}>
                <Ban className="size-3.5" /> Cancelar mi solicitud
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

function PolicyTab({ projectId, versions }: { projectId: string; versions: PolicyVersionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [conflicts, setConflicts] = useState<{ severity: string; code: string; message: string }[]>([]);
  const [activationBlocked, setActivationBlocked] = useState<{ policyId: string; sensitiveChanges: { code: string; label: string }[] } | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [form, setForm] = useState({
    comment: "",
    maxRiskLevel: "DRAFT_WRITE",
    unknownAgentBehavior: "ALLOW_DEFAULT",
    maxRunsPerDay: "",
    maxRunsPerMonth: "",
    maxConcurrentRunsPerProject: "5",
    maxConcurrentRunsPerAgent: "2",
    maxRetries: "3",
    disabledAgentRefs: "",
  });

  function currentPayload() {
    return {
      comment: form.comment || undefined,
      maxRiskLevel: form.maxRiskLevel,
      unknownAgentBehavior: form.unknownAgentBehavior,
      maxRunsPerDay: form.maxRunsPerDay ? Number(form.maxRunsPerDay) : undefined,
      maxRunsPerMonth: form.maxRunsPerMonth ? Number(form.maxRunsPerMonth) : undefined,
      maxConcurrentRunsPerProject: Number(form.maxConcurrentRunsPerProject),
      maxConcurrentRunsPerAgent: Number(form.maxConcurrentRunsPerAgent),
      maxRetries: Number(form.maxRetries),
      rules,
      disabledAgentRefs: form.disabledAgentRefs.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }

  function checkConflicts() {
    startTransition(async () => {
      const result = await previewPolicyConflictsAction(projectId, currentPayload());
      if ("error" in result) toast.error(result.error);
      else setConflicts(result.conflicts);
    });
  }

  function createDraft() {
    startTransition(async () => {
      const result = await createPolicyDraftAction(projectId, currentPayload());
      if ("error" in result && result.error) {
        toast.error(result.error);
        if ("conflicts" in result && result.conflicts) setConflicts(result.conflicts as never);
      } else {
        toast.success("Nueva versión de política creada como borrador.");
        setShowForm(false);
        setRules([]);
        setConflicts([]);
        router.refresh();
      }
    });
  }

  function activate(id: string) {
    startTransition(async () => {
      const result = await activatePolicyVersionAction(projectId, id);
      if ("error" in result && result.error) {
        if ("requiresChangeApproval" in result && result.requiresChangeApproval) {
          setActivationBlocked({ policyId: id, sensitiveChanges: (result as never as { sensitiveChanges: { code: string; label: string }[] }).sensitiveChanges });
        } else {
          toast.error(result.error);
        }
      } else {
        router.refresh();
      }
    });
  }
  function archive(id: string) {
    startTransition(async () => {
      const result = await archivePolicyVersionAction(projectId, id);
      if ("error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }
  function restore(sourcePolicyId: string) {
    startTransition(async () => {
      const result = await restorePolicyVersionAction(projectId, { sourcePolicyId });
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Se creó un nuevo borrador restaurando esta versión.");
        router.refresh();
      }
    });
  }
  function requestChangeApproval() {
    if (!activationBlocked) return;
    startTransition(async () => {
      const result = await requestPolicyChangeApprovalAction(projectId, { policyId: activationBlocked.policyId, reason: changeReason || "Activación de cambios sensibles." });
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Solicitud de aprobación creada. Un MANAGER debe decidirla antes de poder activar.");
        setActivationBlocked(null);
        setChangeReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancelar" : "Nueva versión de política"}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Nueva versión (borrador)</CardTitle>
            <CardDescription>Se crea como borrador — actívala explícitamente cuando quieras que rija las ejecuciones. Las versiones anteriores nunca se sobrescriben.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Comentario</Label>
                <Textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Riesgo máximo permitido</Label>
                <Select value={form.maxRiskLevel} onValueChange={(v) => v && setForm((f) => ({ ...f, maxRiskLevel: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.filter((r) => r !== "EXTERNAL_SIDE_EFFECT").map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Agentes/modos sin regla explícita</Label>
                <Select value={form.unknownAgentBehavior} onValueChange={(v) => v && setForm((f) => ({ ...f, unknownAgentBehavior: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOW_DEFAULT">Permitir con límites base</SelectItem>
                    <SelectItem value="REQUIRE_APPROVAL">Requerir aprobación</SelectItem>
                    <SelectItem value="DENY">Denegar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Máx. ejecuciones/día</Label>
                <Input type="number" value={form.maxRunsPerDay} onChange={(e) => setForm((f) => ({ ...f, maxRunsPerDay: e.target.value }))} placeholder="Sin límite" />
              </div>
              <div className="space-y-1.5">
                <Label>Máx. ejecuciones/mes</Label>
                <Input type="number" value={form.maxRunsPerMonth} onChange={(e) => setForm((f) => ({ ...f, maxRunsPerMonth: e.target.value }))} placeholder="Sin límite" />
              </div>
              <div className="space-y-1.5">
                <Label>Concurrencia máx. (proyecto)</Label>
                <Input type="number" value={form.maxConcurrentRunsPerProject} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentRunsPerProject: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Concurrencia máx. (por agente)</Label>
                <Input type="number" value={form.maxConcurrentRunsPerAgent} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentRunsPerAgent: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Máx. reintentos</Label>
                <Input type="number" value={form.maxRetries} onChange={(e) => setForm((f) => ({ ...f, maxRetries: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Agentes deshabilitados (lista separada por comas)</Label>
                <Input value={form.disabledAgentRefs} onChange={(e) => setForm((f) => ({ ...f, disabledAgentRefs: e.target.value }))} placeholder="p.ej. research-agent, clx...customagentid" />
              </div>
            </div>

            <PolicyRuleEditor projectId={projectId} rules={rules} onChange={setRules} />

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={checkConflicts}>
                Revisar conflictos
              </Button>
              <Button disabled={pending} onClick={createDraft}>
                Guardar borrador
              </Button>
            </div>

            {conflicts.length > 0 ? (
              <div className="space-y-1.5" aria-live="polite">
                {conflicts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={c.severity === "ERROR" ? "destructive" : c.severity === "WARNING" ? "outline" : "secondary"}>{c.severity}</Badge>
                    <span className="text-muted-foreground">{c.code}</span>
                    <span>{c.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay ninguna versión de política — se aplican límites técnicos seguros por defecto.</p>
        ) : (
          versions.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-medium">v{v.version}</span>
                <Badge variant={v.status === "ACTIVE" ? "secondary" : v.status === "ARCHIVED" ? "outline" : "default"}>{v.status}</Badge>
                <span className="text-xs text-muted-foreground">Riesgo máx: {v.maxRiskLevel}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                {v.status === "DRAFT" ? (
                  <Button size="sm" disabled={pending} onClick={() => activate(v.id)}>
                    Activar
                  </Button>
                ) : null}
                {v.status === "ACTIVE" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => archive(v.id)}>
                    Archivar
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => restore(v.id)}>
                  Restaurar como nueva versión
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {activationBlocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Este cambio requiere aprobación humana</CardTitle>
            <CardDescription>{activationBlocked.sensitiveChanges.map((c) => c.label).join(" ")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Motivo de la solicitud</Label>
            <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Explica por qué es necesario este cambio" />
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={activationBlocked !== null}
        onOpenChange={(o) => !o && setActivationBlocked(null)}
        title="Solicitar aprobación de cambio sensible"
        description="Otra persona con rol MANAGER (o tú mismo si eres el único en el proyecto) deberá decidir esta solicitud antes de poder activar la política."
        confirmLabel="Solicitar aprobación"
        onConfirm={requestChangeApproval}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function SimulationTab({ projectId }: { projectId: string }) {
  const [form, setForm] = useState({ agentRef: "", mode: "", operationType: "CREATE_RUN", contextChars: "0", expectedOutputChars: "0", retryCount: "0" });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  function simulate() {
    startTransition(async () => {
      const response = await simulateGovernancePolicyAction(projectId, {
        agentRef: form.agentRef,
        mode: form.mode || undefined,
        operationType: form.operationType,
        contextChars: Number(form.contextChars) || 0,
        expectedOutputChars: Number(form.expectedOutputChars) || 0,
        retryCount: Number(form.retryCount) || 0,
      });
      if ("error" in response) {
        toast.error(response.error);
        return;
      }
      setResult(response.result as unknown as Record<string, unknown>);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" /> Simular una decisión
          </CardTitle>
          <CardDescription>No crea ninguna ejecución, no consume presupuesto y no emite eventos — usa el mismo motor real de políticas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Agente (officialAgentKey / customAgentId / teamId)</Label>
            <Input value={form.agentRef} onChange={(e) => setForm((f) => ({ ...f, agentRef: e.target.value }))} placeholder="p.ej. performance-strategist" />
          </div>
          <div className="space-y-1.5">
            <Label>Modo (opcional)</Label>
            <Input value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} placeholder="p.ej. ANALYZE" />
          </div>
          <div className="space-y-1.5">
            <Label>Operación</Label>
            <Select value={form.operationType} onValueChange={(v) => v && setForm((f) => ({ ...f, operationType: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_TYPES.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reintentos simulados</Label>
            <Input type="number" value={form.retryCount} onChange={(e) => setForm((f) => ({ ...f, retryCount: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={pending || !form.agentRef} onClick={simulate}>
              <ListChecks className="size-4" /> Simular
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant={DECISION_TONE[result.decision as string] ?? "outline"}>{String(result.decision)}</Badge>
              <span className="text-sm font-normal text-muted-foreground">{String(result.code)}</span>
            </CardTitle>
            <CardDescription>{String(result.reason)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Riesgo evaluado: {String(result.riskLevel)}</p>
            <p>Concurrencia observada: {String(result.concurrencyObserved)}</p>
            {Array.isArray(result.warnings) && result.warnings.length > 0 ? (
              <div>
                <p className="font-medium">Advertencias</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {(result.warnings as string[]).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="font-medium">Reglas evaluadas</p>
              <div className="space-y-1">
                {(result.rulesEvaluated as { code: string; outcome: string; message: string }[]).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={r.outcome === "TRIGGERED" ? "destructive" : r.outcome === "PASSED" ? "secondary" : "outline"}>{r.outcome}</Badge>
                    <span className="text-muted-foreground">{r.code}</span>
                    <span>{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

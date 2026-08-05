"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Table2, GitCompare, Gauge, Rocket, LayoutTemplate, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime } from "@/components/automations/labels";
import {
  runMassSimulationAction,
  getPolicyCoverageAction,
  comparePolicyVersionsAction,
  analyzePolicyImpactAction,
  listGovernanceTemplatesAction,
  getGovernanceTemplateDraftAction,
  createPolicyDraftAction,
  getRolloutAction,
  startShadowRolloutAction,
  updateRolloutScopeAction,
  promoteRolloutAction,
  retireRolloutAction,
  listShadowDifferencesAction,
} from "@/server/actions/agent-governance";

interface PolicyVersionRow {
  id: string;
  version: number;
  status: string;
  createdAt: string;
}

const DECISION_TONE: Record<string, "default" | "destructive" | "outline" | "secondary"> = { ALLOW: "secondary", DENY: "destructive", REQUIRE_APPROVAL: "outline" };

export function PolicyStudio({ projectId, versions }: { projectId: string; versions: PolicyVersionRow[] }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(versions[0]?.id ?? "");

  if (versions.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Crea primero una versión de política en la pestaña &quot;Política&quot; para usar Policy Studio.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-1.5">
        <Label>Versión de política a analizar</Label>
        <Select value={selectedPolicyId} onValueChange={(v) => v && setSelectedPolicyId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                v{v.version} — {v.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">
            <Table2 className="size-3.5" /> Matriz
          </TabsTrigger>
          <TabsTrigger value="coverage">
            <ListChecks className="size-3.5" /> Cobertura
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompare className="size-3.5" /> Comparar
          </TabsTrigger>
          <TabsTrigger value="impact">
            <Gauge className="size-3.5" /> Impacto
          </TabsTrigger>
          <TabsTrigger value="rollout">
            <Rocket className="size-3.5" /> Rollout
          </TabsTrigger>
          <TabsTrigger value="templates">
            <LayoutTemplate className="size-3.5" /> Plantillas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <MatrixTab projectId={projectId} policyId={selectedPolicyId} />
        </TabsContent>
        <TabsContent value="coverage" className="mt-4">
          <CoverageTab projectId={projectId} policyId={selectedPolicyId} />
        </TabsContent>
        <TabsContent value="compare" className="mt-4">
          <CompareTab projectId={projectId} versions={versions} defaultPolicyId={selectedPolicyId} />
        </TabsContent>
        <TabsContent value="impact" className="mt-4">
          <ImpactTab projectId={projectId} policyId={selectedPolicyId} />
        </TabsContent>
        <TabsContent value="rollout" className="mt-4">
          <RolloutTab projectId={projectId} policyId={selectedPolicyId} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

interface MatrixCellData {
  agentRef: string;
  agentLabel: string;
  isCustom: boolean;
  mode: string | null;
  riskLevel: string;
  decision: string;
  code: string;
  reason: string;
  requireApproval: boolean;
  hasExplicitRule: boolean;
  effective: {
    enabled: { value: boolean; origin: string; locked: boolean };
    maxRunsPerDay: { value: number | null; origin: string };
    maxConcurrent: { value: number; origin: string };
    maxRetries: { value: number; origin: string };
  };
}

function MatrixTab({ projectId, policyId }: { projectId: string; policyId: string }) {
  const [cells, setCells] = useState<MatrixCellData[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!policyId) return;
    void Promise.resolve().then(() => {
      setLoading(true);
      return runMassSimulationAction(projectId, { policyId, agentRefs: [], operationType: "CREATE_RUN" })
        .then((result) => {
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          setCells(result.cells as unknown as MatrixCellData[]);
          setTruncated(result.truncated);
        })
        .finally(() => setLoading(false));
    });
  }, [projectId, policyId]);

  if (loading || cells === null) return <p className="py-8 text-center text-sm text-muted-foreground">{loading ? "Calculando matriz…" : "Sin datos."}</p>;

  return (
    <div className="space-y-2">
      {truncated ? <p className="text-xs text-muted-foreground">Se alcanzó el máximo de celdas calculadas de una vez — algunos agentes no se muestran.</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Agente</th>
              <th className="py-2 pr-3">Modo</th>
              <th className="py-2 pr-3">Riesgo</th>
              <th className="py-2 pr-3">Decisión</th>
              <th className="py-2 pr-3">Habilitado</th>
              <th className="py-2 pr-3">Runs/día</th>
              <th className="py-2 pr-3">Concurrencia</th>
              <th className="py-2 pr-3">Reintentos</th>
              <th className="py-2 pr-3">Cobertura</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell, i) => (
              <tr key={i} className="border-b">
                <td className="py-1.5 pr-3">
                  {cell.agentLabel} {cell.isCustom ? <Badge variant="outline">personalizado</Badge> : null}
                </td>
                <td className="py-1.5 pr-3">{cell.mode ?? "—"}</td>
                <td className="py-1.5 pr-3">{cell.riskLevel}</td>
                <td className="py-1.5 pr-3">
                  <Badge variant={DECISION_TONE[cell.decision] ?? "outline"}>{cell.decision}</Badge>
                </td>
                <td className="py-1.5 pr-3">
                  {String(cell.effective.enabled.value)} <span className="text-xs text-muted-foreground">({cell.effective.enabled.origin})</span>
                </td>
                <td className="py-1.5 pr-3">
                  {cell.effective.maxRunsPerDay.value ?? "sin límite"} <span className="text-xs text-muted-foreground">({cell.effective.maxRunsPerDay.origin})</span>
                </td>
                <td className="py-1.5 pr-3">
                  {cell.effective.maxConcurrent.value} <span className="text-xs text-muted-foreground">({cell.effective.maxConcurrent.origin})</span>
                </td>
                <td className="py-1.5 pr-3">
                  {cell.effective.maxRetries.value} <span className="text-xs text-muted-foreground">({cell.effective.maxRetries.origin})</span>
                </td>
                <td className="py-1.5 pr-3">{cell.hasExplicitRule ? <Badge variant="secondary">Regla explícita</Badge> : <Badge variant="outline">Heredado</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function CoverageTab({ projectId, policyId }: { projectId: string; policyId: string }) {
  const [report, setReport] = useState<{
    covered: { agentRef: string; agentLabel: string; mode: string | null }[];
    uncovered: { agentRef: string; agentLabel: string; mode: string | null }[];
    orphanedRules: { id: string; scope: string; agentRef: string; mode: string }[];
    unknownAgentBehavior: string;
  } | null>(null);

  useEffect(() => {
    if (!policyId) return;
    getPolicyCoverageAction(projectId, policyId).then((result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setReport(result as never);
    });
  }, [projectId, policyId]);

  if (!report) return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Comportamiento para agentes sin regla explícita</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">{report.unknownAgentBehavior}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sin cobertura ({report.uncovered.length})</CardTitle>
          <CardDescription>Agentes/modos que dependen únicamente de los valores base de la política.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {report.uncovered.length === 0 ? <p className="text-sm text-muted-foreground">Todo tiene cobertura explícita o hereda de forma segura.</p> : null}
          {report.uncovered.map((u, i) => (
            <div key={i} className="text-sm">
              {u.agentLabel} {u.mode ? `· ${u.mode}` : ""}
            </div>
          ))}
        </CardContent>
      </Card>
      {report.orphanedRules.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Reglas huérfanas ({report.orphanedRules.length})</CardTitle>
            <CardDescription>Reglas que referencian un agente que ya no existe en el catálogo del proyecto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {report.orphanedRules.map((r) => (
              <div key={r.id} className="text-sm text-muted-foreground">
                {r.scope} · {r.agentRef} {r.mode ? `· ${r.mode}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

function CompareTab({ projectId, versions, defaultPolicyId }: { projectId: string; versions: PolicyVersionRow[]; defaultPolicyId: string }) {
  const [policyIdA, setPolicyIdA] = useState(versions[1]?.id ?? versions[0]?.id ?? "");
  const [policyIdB, setPolicyIdB] = useState(defaultPolicyId);
  const [result, setResult] = useState<{ versionA: number; versionB: number; fieldChanges: { field: string; from: unknown; to: unknown }[]; ruleChanges: { scope: string; agentRef: string; mode: string; kind: string }[] } | null>(null);
  const [pending, startTransition] = useTransition();

  function compare() {
    startTransition(async () => {
      const res = await comparePolicyVersionsAction(projectId, { policyIdA, policyIdB });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setResult(res as never);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Versión A</Label>
          <Select value={policyIdA} onValueChange={(v) => v && setPolicyIdA(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Versión B</Label>
          <Select value={policyIdB} onValueChange={(v) => v && setPolicyIdB(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={pending || !policyIdA || !policyIdB} onClick={compare}>
          Comparar
        </Button>
      </div>

      {result ? (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>
                Campos de política (v{result.versionA} → v{result.versionB})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.fieldChanges.length === 0 ? <p className="text-sm text-muted-foreground">Sin diferencias en los campos base.</p> : null}
              {result.fieldChanges.map((c, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{c.field}</span>: {String(c.from)} → {String(c.to)}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reglas ({result.ruleChanges.length} cambios)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.ruleChanges.length === 0 ? <p className="text-sm text-muted-foreground">Sin diferencias en overrides.</p> : null}
              {result.ruleChanges.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant={c.kind === "ADDED" ? "secondary" : c.kind === "REMOVED" ? "destructive" : "outline"}>{c.kind}</Badge>
                  <span>
                    {c.scope} · {c.agentRef} {c.mode ? `· ${c.mode}` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impact analysis
// ---------------------------------------------------------------------------

function ImpactTab({ projectId, policyId }: { projectId: string; policyId: string }) {
  const [maxRuns, setMaxRuns] = useState("200");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    runsAnalyzed: number;
    truncated: boolean;
    agentsAffected: string[];
    transitions: Record<string, number>;
    sample: { runId: string; agentRef: string; mode: string | null; historicalDecision: string; hypotheticalDecision: string; changed: boolean }[];
  } | null>(null);

  function run() {
    startTransition(async () => {
      const res = await analyzePolicyImpactAction(projectId, { policyId, maxRuns: Number(maxRuns) || 200 });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setResult(res as never);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label>Máx. ejecuciones a analizar</Label>
          <Input type="number" value={maxRuns} onChange={(e) => setMaxRuns(e.target.value)} className="w-32" />
        </div>
        <Button disabled={pending || !policyId} onClick={run}>
          Analizar impacto
        </Button>
      </div>

      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.runsAnalyzed} ejecuciones analizadas{result.truncated ? " (muestra limitada — no es el historial completo)" : ""} · {result.agentsAffected.length} agente(s)
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(result.transitions).map(([key, value]) => (
              <Card key={key}>
                <CardContent className="py-3">
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="text-lg font-semibold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Ejemplos de cambios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.sample.filter((s) => s.changed).length === 0 ? <p className="text-sm text-muted-foreground">Ninguna ejecución de la muestra habría cambiado de decisión.</p> : null}
              {result.sample
                .filter((s) => s.changed)
                .map((s) => (
                  <div key={s.runId} className="flex items-center gap-2 text-sm">
                    <span>
                      {s.agentRef} {s.mode ? `· ${s.mode}` : ""}
                    </span>
                    <Badge variant={DECISION_TONE[s.historicalDecision] ?? "outline"}>{s.historicalDecision}</Badge>
                    <span>→</span>
                    <Badge variant={DECISION_TONE[s.hypotheticalDecision] ?? "outline"}>{s.hypotheticalDecision}</Badge>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollout
// ---------------------------------------------------------------------------

function RolloutTab({ projectId, policyId }: { projectId: string; policyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rollout, setRollout] = useState<{ id: string; stage: string; scopeAgentRefs: string[]; scopeModes: string[]; percentage: number | null; shadowEvaluationCount: number; shadowDifferenceCount: number } | null | undefined>(undefined);
  const [scopeAgentRefs, setScopeAgentRefs] = useState("");
  const [scopeModes, setScopeModes] = useState("");
  const [percentage, setPercentage] = useState("");
  const [differences, setDifferences] = useState<{ id: string; agentRef: string; mode: string | null; activeDecision: string; shadowDecision: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (!policyId) return;
    getRolloutAction(projectId, policyId).then((r) => {
      setRollout(r as never);
      if (r) {
        setScopeAgentRefs(r.scopeAgentRefs.join(", "));
        setScopeModes(r.scopeModes.join(", "));
        setPercentage(r.percentage != null ? String(r.percentage) : "");
      }
    });
  }, [projectId, policyId]);

  function refresh() {
    router.refresh();
    getRolloutAction(projectId, policyId).then((r) => setRollout(r as never));
  }

  function start() {
    startTransition(async () => {
      const res = await startShadowRolloutAction(projectId, policyId);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Rollout SHADOW iniciado — no afecta decisiones reales.");
        refresh();
      }
    });
  }
  function saveScope() {
    startTransition(async () => {
      const res = await updateRolloutScopeAction(projectId, {
        policyId,
        scopeAgentRefs: scopeAgentRefs.split(",").map((s) => s.trim()).filter(Boolean),
        scopeModes: scopeModes.split(",").map((s) => s.trim()).filter(Boolean),
        percentage: percentage ? Number(percentage) : null,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Alcance actualizado.");
        refresh();
      }
    });
  }
  function promote(targetStage: "LIMITED" | "PROMOTED") {
    startTransition(async () => {
      const res = await promoteRolloutAction(projectId, { policyId, targetStage });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success(targetStage === "LIMITED" ? "Rollout pasó a LIMITED." : "Política promovida a ACTIVE.");
        refresh();
      }
    });
  }
  function retire() {
    startTransition(async () => {
      const res = await retireRolloutAction(projectId, { policyId });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Rollout retirado.");
        refresh();
      }
    });
  }
  function loadDifferences() {
    if (!rollout) return;
    startTransition(async () => {
      const res = await listShadowDifferencesAction(projectId, rollout.id);
      setDifferences(res as never);
    });
  }

  if (rollout === undefined) return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;

  if (rollout === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Este borrador todavía no tiene un rollout. SHADOW evalúa en paralelo sin afectar decisiones reales.</p>
        <Button disabled={pending} onClick={start}>
          Iniciar rollout SHADOW
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rollout.stage === "PROMOTED" ? "secondary" : "outline"}>{rollout.stage}</Badge>
        <span className="text-xs text-muted-foreground">
          {rollout.shadowEvaluationCount} evaluaciones sombra · {rollout.shadowDifferenceCount} con diferencia
        </span>
      </div>

      {rollout.stage === "SHADOW" || rollout.stage === "LIMITED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Alcance de LIMITED</CardTitle>
            <CardDescription>Vacío en las tres dimensiones = el rollout LIMITED no se aplica a nadie todavía (por seguridad).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Agentes (separados por coma)</Label>
              <Input value={scopeAgentRefs} onChange={(e) => setScopeAgentRefs(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Modos (separados por coma)</Label>
              <Input value={scopeModes} onChange={(e) => setScopeModes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porcentaje (0-100)</Label>
              <Input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Button size="sm" variant="outline" disabled={pending} onClick={saveScope}>
                Guardar alcance
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {rollout.stage === "SHADOW" ? (
          <Button size="sm" disabled={pending} onClick={() => promote("LIMITED")}>
            Pasar a LIMITED
          </Button>
        ) : null}
        {(rollout.stage === "SHADOW" || rollout.stage === "LIMITED") ? (
          <Button size="sm" disabled={pending} onClick={() => promote("PROMOTED")}>
            Promover a ACTIVE
          </Button>
        ) : null}
        {rollout.stage !== "PROMOTED" && rollout.stage !== "RETIRED" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={retire}>
            Retirar rollout
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={pending} onClick={loadDifferences}>
          Ver diferencias sombra
        </Button>
      </div>

      {differences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Diferencias registradas ({differences.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {differences.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {d.agentRef} {d.mode ? `· ${d.mode}` : ""}
                </span>
                <Badge variant={DECISION_TONE[d.activeDecision] ?? "outline"}>{d.activeDecision}</Badge>
                <span>vs.</span>
                <Badge variant={DECISION_TONE[d.shadowDecision] ?? "outline"}>{d.shadowDecision}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function TemplatesTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<{ key: string; label: string; description: string }[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listGovernanceTemplatesAction().then(setTemplates);
  }, []);

  function applyTemplate(key: string) {
    startTransition(async () => {
      const draftResult = await getGovernanceTemplateDraftAction(projectId, { templateKey: key });
      if ("error" in draftResult) {
        toast.error(draftResult.error);
        return;
      }
      const created = await createPolicyDraftAction(projectId, draftResult.draft);
      if ("error" in created && created.error) {
        toast.error(created.error);
        return;
      }
      toast.success('Borrador creado desde la plantilla — edítalo en la pestaña "Política".');
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {templates.map((t) => (
        <Card key={t.key}>
          <CardHeader>
            <CardTitle>{t.label}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" disabled={pending} onClick={() => applyTemplate(t.key)}>
              Usar esta plantilla
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

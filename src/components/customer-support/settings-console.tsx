"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { useLocalAI } from "@/hooks/use-local-ai";
import { RESPONSE_TYPE_LABELS, EVIDENCE_LABELS, EVIDENCE_TONE, TONE_LABELS, APPEARANCE_THEME_LABELS } from "@/components/customer-support/labels";
import {
  updateCustomerSupportConfigAction,
  activateCustomerSupportAgentAction,
  deactivateCustomerSupportAgentAction,
  testCustomerSupportAgentAction,
  completeTestCustomerSupportAgentAction,
  claimPublicSiteAction,
  disablePublicSiteAction,
  checkPublicSiteInstallationAction,
} from "@/server/actions/customer-support";

interface ConfigShape {
  active: boolean;
  publicId: string;
  updatedAt: string;
  agentName: string;
  welcomeMessage: string;
  buttonText: string;
  suggestedQuestions: string[];
  language: string;
  tone: string;
  position: string;
  includedPaths: string[];
  excludedPaths: string[];
  allowedDomains: string[];
  offHoursMessage: string | null;
  humanHandoffEnabled: boolean;
  maxMessagesPerConversation: number;
  retentionDays: number;
  privacyText: string;
  appearanceTheme: string;
}

interface Checklist {
  hasValidConfig: boolean;
  hasPublishedFaqOrApprovedSource: boolean;
  publishedFaqCount: number;
  approvedKnowledgeCount: number;
  testCompleted: boolean;
  readyToActivate: boolean;
  warnings: string[];
}

interface TestAnswer {
  answer: string;
  responseType: string;
  evidence: string;
  sources: { type: string; title: string; link: string | null }[];
  needsHuman: boolean;
  suggestions: string[];
}

interface PublicSiteRow {
  id: string;
  hostname: string;
  status: string;
  verifiedAt: string | null;
}

export function SettingsConsole({
  projectId,
  isManager,
  config: initialConfig,
  checklist: initialChecklist,
  publicSites: initialPublicSites,
}: {
  projectId: string;
  isManager: boolean;
  config: ConfigShape;
  checklist: Checklist;
  publicSites: PublicSiteRow[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [testQuestion, setTestQuestion] = useState("");
  const [testAnswer, setTestAnswer] = useState<TestAnswer | null>(null);
  const [testWarning, setTestWarning] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const localAI = useLocalAI();

  const [publicSites] = useState(initialPublicSites);
  const [newHostname, setNewHostname] = useState("");
  const [hostnameBusy, setHostnameBusy] = useState(false);
  const [hostnameError, setHostnameError] = useState<string | null>(null);
  const [installChecks, setInstallChecks] = useState<Record<string, { live: boolean; reason?: string; checkedAt: string }>>({});

  async function refreshPublicSites() {
    location.reload();
  }

  async function claimHostname() {
    if (!newHostname.trim()) return;
    setHostnameBusy(true);
    setHostnameError(null);
    const result = await claimPublicSiteAction(projectId, { hostname: newHostname });
    setHostnameBusy(false);
    if (result.error) {
      setHostnameError(result.error);
      return;
    }
    setNewHostname("");
    await refreshPublicSites();
  }

  async function disableHostname(siteId: string) {
    setHostnameBusy(true);
    await disablePublicSiteAction(projectId, siteId);
    setHostnameBusy(false);
    await refreshPublicSites();
  }

  async function checkInstallation(siteId: string) {
    const result = await checkPublicSiteInstallationAction(projectId, siteId);
    setInstallChecks((prev) => ({ ...prev, [siteId]: { ...result, checkedAt: new Date().toLocaleString("es") } }));
  }

  async function saveConfig() {
    setBusy(true);
    setSavedMessage(null);
    const result = await updateCustomerSupportConfigAction(projectId, {
      agentName: config.agentName,
      welcomeMessage: config.welcomeMessage,
      buttonText: config.buttonText,
      suggestedQuestions: config.suggestedQuestions,
      language: config.language,
      tone: config.tone as never,
      position: config.position as never,
      includedPaths: config.includedPaths,
      excludedPaths: config.excludedPaths,
      allowedDomains: config.allowedDomains,
      offHoursMessage: config.offHoursMessage,
      humanHandoffEnabled: config.humanHandoffEnabled,
      maxMessagesPerConversation: config.maxMessagesPerConversation,
      retentionDays: config.retentionDays,
      privacyText: config.privacyText,
      appearanceTheme: config.appearanceTheme as never,
    });
    setBusy(false);
    if ("error" in result && result.error) {
      setSavedMessage(result.error);
      return;
    }
    setSavedMessage("Configuracion guardada.");
  }

  async function runTest() {
    setTestBusy(true);
    setTestAnswer(null);
    setTestWarning(null);
    const result = await testCustomerSupportAgentAction(projectId, { question: testQuestion });
    if ("error" in result) {
      setTestWarning(result.error);
      setTestBusy(false);
      return;
    }
    if (!result.needsGeneration) {
      setTestAnswer(result.answer as unknown as TestAnswer);
      setTestBusy(false);
      await refreshChecklist();
      return;
    }

    const generated = await localAI.generate({ system: result.systemPrompt, prompt: result.userPrompt, maxTokens: 400 });
    if (!generated) {
      setTestWarning(localAI.error ?? "Tu navegador no soporta IA local. Las FAQ y la busqueda siguen funcionando igual en el widget real.");
      setTestBusy(false);
      return;
    }

    const completed = await completeTestCustomerSupportAgentAction(projectId, result.runId, result.executionToken, generated);
    setTestBusy(false);
    if ("error" in completed) {
      setTestWarning(completed.error);
      return;
    }
    setTestAnswer(completed.answer as unknown as TestAnswer);
    await refreshChecklist();
  }

  async function refreshChecklist() {
    // A fresh server round-trip keeps the activation checklist honest after a real test exchange.
    const mod = await import("@/server/actions/customer-support");
    const fresh = await mod.getActivationChecklistAction(projectId);
    setChecklist(fresh);
  }

  async function handleActivate() {
    setActivateError(null);
    const result = await activateCustomerSupportAgentAction(projectId);
    if ("error" in result && result.error) {
      setActivateError(result.error);
      return;
    }
    setConfig({ ...config, active: true });
  }

  async function handleDeactivate() {
    await deactivateCustomerSupportAgentAction(projectId);
    setConfig({ ...config, active: false });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Estado</CardTitle>
          <Badge variant={config.active ? "secondary" : "outline"}>{config.active ? "Activo" : "Desactivado"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            <li>{checklist.hasValidConfig ? "OK" : "Pendiente"} — Configuracion valida (bienvenida y privacidad)</li>
            <li>
              {checklist.hasPublishedFaqOrApprovedSource ? "OK" : "Pendiente"} — Al menos una FAQ publicada o fuente aprobada ({checklist.publishedFaqCount} FAQ, {checklist.approvedKnowledgeCount} fuentes)
            </li>
            <li>{checklist.testCompleted ? "OK" : "Pendiente"} — Prueba real completada</li>
          </ul>
          {isManager ? (
            config.active ? (
              <Button variant="outline" onClick={handleDeactivate}>
                Desactivar agente
              </Button>
            ) : (
              <Button onClick={() => setActivateOpen(true)} disabled={!checklist.readyToActivate}>
                Activar agente
              </Button>
            )
          ) : null}
          {activateError ? <p className="text-sm text-destructive">{activateError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instalacion publica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!config.active ? (
            <p className="text-muted-foreground">Activa el agente para poder asignarle un dominio publico.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Cada dominio publico solo puede pertenecer a un proyecto. El widget se muestra unicamente en el dominio que asignes aqui — nunca en el de otro proyecto.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Identificador publico (no es secreto, se usa para conectar el widget)</p>
                  <p className="font-mono text-xs">{config.publicId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paginas incluidas / excluidas</p>
                  <p>
                    {config.includedPaths.length > 0 ? config.includedPaths.join(", ") : "Todas"} / {config.excludedPaths.length > 0 ? config.excludedPaths.join(", ") : "Ninguna"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {publicSites.length === 0 ? (
                  <p className="text-muted-foreground">Sin dominio configurado todavia.</p>
                ) : (
                  publicSites.map((site) => {
                    const check = installChecks[site.id];
                    const statusLabel = site.status === "DISABLED" ? "Desactivado" : site.status === "ACTIVE" ? "Activo en este dominio" : "Pendiente";
                    return (
                      <div key={site.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                        <span className="font-mono text-xs">{site.hostname}</span>
                        <Badge variant={site.status === "ACTIVE" ? "secondary" : site.status === "DISABLED" ? "outline" : "outline"}>{statusLabel}</Badge>
                        {site.status === "ACTIVE" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => checkInstallation(site.id)}>
                              Probar en la web
                            </Button>
                            <a href={`https://${site.hostname}/`} target="_blank" rel="noreferrer" className="text-xs underline">
                              Abrir
                            </a>
                            <Button size="sm" variant="destructive" onClick={() => disableHostname(site.id)} disabled={hostnameBusy}>
                              Desactivar
                            </Button>
                          </>
                        ) : null}
                        {check ? (
                          <p className={`w-full text-xs ${check.live ? "text-emerald-600" : "text-amber-600"}`}>
                            {check.live ? "Activo y visible en este dominio." : `No visible: ${check.reason}`} (verificado {check.checkedAt})
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {isManager ? (
                <div className="space-y-1">
                  <Label>Añadir dominio (ejemplo: soporte.tuempresa.com)</Label>
                  <div className="flex gap-2">
                    <Input value={newHostname} onChange={(e) => setNewHostname(e.target.value)} placeholder="example.com" />
                    <Button size="sm" onClick={claimHostname} disabled={hostnameBusy || !newHostname.trim()}>
                      Asignar
                    </Button>
                  </div>
                  {hostnameError ? <p className="text-xs text-destructive">{hostnameError}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Probar agente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} placeholder="Escribe una pregunta de prueba..." />
            <Button onClick={runTest} disabled={testBusy || !testQuestion.trim()}>
              Probar
            </Button>
          </div>
          {testWarning ? <p className="text-sm text-amber-600">{testWarning}</p> : null}
          {testAnswer ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{RESPONSE_TYPE_LABELS[testAnswer.responseType] ?? testAnswer.responseType}</Badge>
                <Badge variant={EVIDENCE_TONE[testAnswer.evidence] ?? "outline"}>{EVIDENCE_LABELS[testAnswer.evidence] ?? testAnswer.evidence}</Badge>
                {testAnswer.needsHuman ? <Badge variant="destructive">Escalaria a humano</Badge> : null}
              </div>
              <p className="whitespace-pre-wrap">{testAnswer.answer}</p>
              {testAnswer.sources.length > 0 ? (
                <p className="text-xs text-muted-foreground">Fuentes: {testAnswer.sources.map((s) => s.title).join(", ")}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Widget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre visible</Label>
              <Input value={config.agentName} onChange={(e) => setConfig({ ...config, agentName: e.target.value })} maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label>Texto del boton</Label>
              <Input value={config.buttonText} onChange={(e) => setConfig({ ...config, buttonText: e.target.value })} maxLength={50} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensaje de bienvenida</Label>
            <Textarea value={config.welcomeMessage} onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })} rows={2} maxLength={500} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Idioma</Label>
              <Input value={config.language} onChange={(e) => setConfig({ ...config, language: e.target.value })} maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Tono</Label>
              <select value={config.tone} onChange={(e) => setConfig({ ...config, tone: e.target.value })} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
                {Object.entries(TONE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Posicion</Label>
              <select value={config.position} onChange={(e) => setConfig({ ...config, position: e.target.value })} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
                <option value="RIGHT">Derecha</option>
                <option value="LEFT">Izquierda</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Apariencia</Label>
            <select value={config.appearanceTheme} onChange={(e) => setConfig({ ...config, appearanceTheme: e.target.value })} className="w-full rounded-md border bg-background px-2 py-2 text-sm sm:w-64">
              {Object.entries(APPEARANCE_THEME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Paginas incluidas (una por linea, vacio = todas)</Label>
              <Textarea value={config.includedPaths.join("\n")} onChange={(e) => setConfig({ ...config, includedPaths: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Paginas excluidas</Label>
              <Textarea value={config.excludedPaths.join("\n")} onChange={(e) => setConfig({ ...config, excludedPaths: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Dominios permitidos</Label>
              <Textarea value={config.allowedDomains.join("\n")} onChange={(e) => setConfig({ ...config, allowedDomains: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} rows={3} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensaje fuera de horario</Label>
            <Input value={config.offHoursMessage ?? ""} onChange={(e) => setConfig({ ...config, offHoursMessage: e.target.value || null })} maxLength={500} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Limite de mensajes por conversacion</Label>
              <Input type="number" value={config.maxMessagesPerConversation} onChange={(e) => setConfig({ ...config, maxMessagesPerConversation: Number(e.target.value) || 1 })} />
            </div>
            <div className="space-y-1">
              <Label>Retencion (dias)</Label>
              <Input type="number" value={config.retentionDays} onChange={(e) => setConfig({ ...config, retentionDays: Number(e.target.value) || 1 })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.humanHandoffEnabled} onChange={(e) => setConfig({ ...config, humanHandoffEnabled: e.target.checked })} />
            Atencion humana activa
          </label>
          <div className="space-y-1">
            <Label>Texto de privacidad</Label>
            <Textarea value={config.privacyText} onChange={(e) => setConfig({ ...config, privacyText: e.target.value })} rows={2} maxLength={1000} />
          </div>
          {isManager ? (
            <Button onClick={saveConfig} disabled={busy}>
              Guardar configuracion
            </Button>
          ) : null}
          {savedMessage ? <p className="text-xs text-muted-foreground">{savedMessage}</p> : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        title="Activar agente de servicio al cliente"
        description={`Se mostrara en las paginas configuradas para este proyecto. FAQ publicadas: ${checklist.publishedFaqCount}. Fuentes aprobadas: ${checklist.approvedKnowledgeCount}.`}
        confirmLabel="Activar"
        onConfirm={handleActivate}
      />
    </div>
  );
}

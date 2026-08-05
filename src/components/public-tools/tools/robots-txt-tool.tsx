"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { ROBOTS_PRESETS, buildRobotsTxt, parseRobotsTxt, checkRobotsPath, type RobotsFile, type RobotsRuleType } from "@/lib/public-tools/web/robots";

const PRESET_LABELS: { id: keyof typeof ROBOTS_PRESETS; label: string }[] = [
  { id: "allow-all", label: "Permitir rastreo general" },
  { id: "block-folder", label: "Bloquear una carpeta" },
  { id: "block-several", label: "Bloquear varias rutas" },
  { id: "block-with-exception", label: "Bloquear con excepción" },
];

export function RobotsTxtTool() {
  const [file, setFile] = useState<RobotsFile>(ROBOTS_PRESETS["allow-all"]);
  const [pasteText, setPasteText] = useState("");
  const [testUserAgent, setTestUserAgent] = useState("*");
  const [testPath, setTestPath] = useState("/");

  function addGroup() {
    setFile((prev) => ({ ...prev, groups: [...prev.groups, { id: `g${prev.groups.length + 1}-${Date.now()}`, userAgents: ["*"], rules: [], comment: "" }] }));
  }
  function removeGroup(id: string) {
    setFile((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }));
  }
  function duplicateGroup(id: string) {
    setFile((prev) => {
      const group = prev.groups.find((g) => g.id === id);
      if (!group) return prev;
      return { ...prev, groups: [...prev.groups, { ...group, id: `${id}-copy-${Date.now()}` }] };
    });
  }
  function updateGroupUserAgents(id: string, value: string) {
    setFile((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === id ? { ...g, userAgents: value.split(",").map((v) => v.trim()).filter(Boolean) } : g)) }));
  }
  function addRule(groupId: string, type: RobotsRuleType) {
    setFile((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === groupId ? { ...g, rules: [...g.rules, { type, path: "/" }] } : g)) }));
  }
  function updateRule(groupId: string, index: number, path: string) {
    setFile((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === groupId ? { ...g, rules: g.rules.map((r, i) => (i === index ? { ...r, path } : r)) } : g)) }));
  }
  function removeRule(groupId: string, index: number) {
    setFile((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === groupId ? { ...g, rules: g.rules.filter((_, i) => i !== index) } : g)) }));
  }
  function addSitemap() {
    setFile((prev) => ({ ...prev, sitemaps: [...prev.sitemaps, ""] }));
  }
  function updateSitemap(index: number, value: string) {
    setFile((prev) => ({ ...prev, sitemaps: prev.sitemaps.map((s, i) => (i === index ? value : s)) }));
  }

  const robotsTxt = useMemo(() => buildRobotsTxt(file), [file]);
  const checkResult = useMemo(() => checkRobotsPath(file, testUserAgent, testPath), [file, testUserAgent, testPath]);

  function handleParse() {
    setFile(parseRobotsTxt(pasteText));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {PRESET_LABELS.map((p) => (
          <Button key={p.id} type="button" variant="outline" size="sm" onClick={() => setFile(ROBOTS_PRESETS[p.id])}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {file.groups.map((group) => (
          <div key={group.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={`ua-${group.id}`} className="shrink-0">
                User-agent(s)
              </Label>
              <Input id={`ua-${group.id}`} className="max-w-xs" value={group.userAgents.join(", ")} onChange={(e) => updateGroupUserAgents(group.id, e.target.value)} />
              <Button type="button" variant="outline" size="sm" onClick={() => duplicateGroup(group.id)}>
                Duplicar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeGroup(group.id)}>
                Eliminar grupo
              </Button>
            </div>
            {group.rules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-20 text-xs text-muted-foreground">{rule.type === "allow" ? "Allow" : "Disallow"}</span>
                <Input aria-label={`Ruta ${index + 1} de ${group.userAgents.join(",")}`} value={rule.path} onChange={(e) => updateRule(group.id, index, e.target.value)} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(group.id, index)}>
                  ✕
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addRule(group.id, "allow")}>
                Añadir Allow
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addRule(group.id, "disallow")}>
                Añadir Disallow
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addGroup}>
          Añadir grupo
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Sitemaps</p>
        {file.sitemaps.map((sitemap, index) => (
          <Input key={index} aria-label={`Sitemap ${index + 1}`} value={sitemap} onChange={(e) => updateSitemap(index, e.target.value)} placeholder="https://ejemplo.com/sitemap.xml" />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addSitemap}>
          Añadir sitemap
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="robots-output" className="mb-1">
          robots.txt generado
        </Label>
        <Textarea id="robots-output" readOnly value={robotsTxt} rows={8} className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={robotsTxt} label="Copiar" />
          <DownloadButton content={robotsTxt} filename="robots.txt" mimeType="text/plain" label="Descargar robots.txt" />
          <ResetButton onReset={() => setFile(ROBOTS_PRESETS["allow-all"])} />
        </div>
      </div>

      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="robots-paste" className="mb-1">
          Pegar un robots.txt existente para analizarlo
        </Label>
        <Textarea id="robots-paste" value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={handleParse}>
          Analizar y cargar
        </Button>
      </div>

      <div className="space-y-2 border-t pt-6">
        <p className="text-sm font-medium">Comprobador de rutas</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="check-ua" className="mb-1">
              User-agent
            </Label>
            <Input id="check-ua" value={testUserAgent} onChange={(e) => setTestUserAgent(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="check-path" className="mb-1">
              Ruta
            </Label>
            <Input id="check-path" value={testPath} onChange={(e) => setTestPath(e.target.value)} />
          </div>
        </div>
        <div aria-live="polite" className={`rounded-lg border p-3 text-sm ${checkResult.allowed ? "border-emerald-500/40" : "border-destructive/40"}`}>
          <p className="font-medium">{checkResult.allowed ? "✓ Permitido" : "✗ Bloqueado"}</p>
          <p className="text-muted-foreground">{checkResult.explanation}</p>
        </div>
      </div>

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        robots.txt controla el rastreo, pero no protege contenido privado ni garantiza que una URL desaparezca de los buscadores.
      </p>
    </div>
  );
}

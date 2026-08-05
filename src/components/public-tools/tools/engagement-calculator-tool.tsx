"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  ENGAGEMENT_PLATFORMS,
  ENGAGEMENT_METHODS,
  ENGAGEMENT_METHOD_EXPLANATION,
  ENGAGEMENT_REFERENCE_NOTE,
  calculateEngagement,
  type EngagementMethod,
  type EngagementPlatform,
} from "@/lib/public-tools/engagement";

const FIELD_LABELS: Record<string, string> = {
  followers: "Seguidores",
  reach: "Alcance",
  impressions: "Impresiones",
  views: "Visualizaciones",
  likes: "Likes",
  comments: "Comentarios",
  shares: "Compartidos",
  saves: "Guardados",
  clicks: "Clics",
};

const METHOD_DENOMINATOR_KEY: Record<EngagementMethod, string> = {
  followers: "followers",
  reach: "reach",
  impressions: "impressions",
  views: "views",
};

export function EngagementCalculatorTool() {
  const [platform, setPlatform] = useState<EngagementPlatform>("instagram");
  const [method, setMethod] = useState<EngagementMethod>("followers");
  const [values, setValues] = useState<Record<string, string>>({});

  function setField(key: string, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw }));
  }

  const numericInputs = useMemo(() => {
    const parsed: Record<string, number | undefined> = {};
    for (const [key, raw] of Object.entries(values)) {
      if (raw.trim() === "") {
        parsed[key] = undefined;
        continue;
      }
      parsed[key] = Number(raw);
    }
    return parsed;
  }, [values]);

  const result = useMemo(() => calculateEngagement(method, numericInputs), [method, numericInputs]);

  const denominatorKey = METHOD_DENOMINATOR_KEY[method];
  const visibleFields = [denominatorKey, "likes", "comments", "shares", "saves", "clicks"];

  const report = result.ok
    ? [
        `Plataforma: ${ENGAGEMENT_PLATFORMS.find((p) => p.id === platform)?.label}`,
        `Método: ${ENGAGEMENT_METHODS.find((m) => m.id === method)?.label}`,
        `Fórmula: ${result.formula}`,
        `Tasa de engagement: ${result.ratePercent?.toFixed(2)}%`,
        "",
        ENGAGEMENT_REFERENCE_NOTE,
      ].join("\n")
    : "";

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Plataforma" className="flex flex-wrap gap-2">
        {ENGAGEMENT_PLATFORMS.map((p) => (
          <Button key={p.id} type="button" size="sm" variant={platform === p.id ? "default" : "outline"} aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Método de cálculo</p>
        <div role="group" aria-label="Método" className="flex flex-wrap gap-2">
          {ENGAGEMENT_METHODS.map((m) => (
            <Button key={m.id} type="button" size="sm" variant={method === m.id ? "default" : "outline"} aria-pressed={method === m.id} onClick={() => setMethod(m.id)}>
              {m.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{ENGAGEMENT_METHOD_EXPLANATION}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {visibleFields.map((field) => (
          <div key={field}>
            <Label htmlFor={`engagement-${field}`} className="mb-1">
              {FIELD_LABELS[field]}
              {field === denominatorKey ? " *" : ""}
            </Label>
            <Input
              id={`engagement-${field}`}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={values[field] ?? ""}
              onChange={(e) => setField(field, e.target.value)}
            />
          </div>
        ))}
      </div>

      {!result.ok && result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {result.ok ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-2xl font-semibold tabular-nums">{result.ratePercent?.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground">Fórmula: {result.formula}</p>
          <p className="text-xs text-muted-foreground">{ENGAGEMENT_REFERENCE_NOTE}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={report} label="Copiar resultado" />
        <DownloadButton content={report} filename="calculadora-engagement.txt" label="Descargar resumen" />
        <ResetButton onReset={() => setValues({})} />
      </div>
    </div>
  );
}

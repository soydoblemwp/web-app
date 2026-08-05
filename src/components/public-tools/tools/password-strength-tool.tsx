"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { analyzePasswordStrength, type StrengthLabel } from "@/lib/public-tools/utilities/password-strength";

const LABEL_COPY: Record<StrengthLabel, { text: string; className: string; percent: number }> = {
  MUY_DÉBIL: { text: "Muy débil", className: "bg-red-600", percent: 20 },
  DÉBIL: { text: "Débil", className: "bg-orange-500", percent: 40 },
  MODERADA: { text: "Moderada", className: "bg-amber-500", percent: 60 },
  FUERTE: { text: "Fuerte", className: "bg-lime-600", percent: 80 },
  MUY_FUERTE: { text: "Muy fuerte", className: "bg-emerald-600", percent: 100 },
};

export function PasswordStrengthTool() {
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  // Pure client-side computation on every keystroke — never sent anywhere, never logged.
  const analysis = useMemo(() => analyzePasswordStrength(password), [password]);
  const copy = LABEL_COPY[analysis.label];

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="password-strength-input" className="mb-1">
          Contraseña a analizar
        </Label>
        <div className="flex gap-2">
          <Input
            id="password-strength-input"
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Escribe una contraseña..."
          />
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setReveal((r) => !r)}>
            {reveal ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Se analiza solo en tu navegador; nunca se envía, se guarda ni se copia automáticamente.</p>
      </div>

      {password ? (
        <div aria-live="polite" className="space-y-4 rounded-lg border p-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Fortaleza: {copy.text} ({analysis.label.replace("_", " ")})
              </span>
              <span className="text-muted-foreground">{analysis.length} caracteres</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Fortaleza: ${copy.text}`}>
              <div className={`h-full ${copy.className}`} style={{ width: `${copy.percent}%` }} />
            </div>
          </div>

          {analysis.findings.length > 0 ? (
            <div>
              <p className="text-sm font-medium">Razones detectadas</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {analysis.findings.map((f) => (
                  <li key={f.code}>{f.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se detectaron patrones débiles obvios.</p>
          )}

          <div>
            <p className="text-sm font-medium">Recomendaciones</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {analysis.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          {analysis.crackTimeEstimate ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">Estimación educativa de tiempo de descifrado:</strong> {analysis.crackTimeEstimate}.
              </p>
              <p className="mt-1">{analysis.crackTimeExplanation}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <ResetButton onReset={() => setPassword("")} />

      <p className="text-sm">
        ¿Necesitas una contraseña nueva?{" "}
        <Link href="/herramientas/generador-contrasenas" className="underline">
          Usa el generador de contraseñas seguras
        </Link>
        .
      </p>
    </div>
  );
}

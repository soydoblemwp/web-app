"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { generateUuidV4, generateUuidV7, validateUuid, uuidToCompact, type UuidValidationResult } from "@/lib/public-tools/utilities/uuid";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";

type UuidVersion = "v4" | "v7";

export function UuidGeneratorTool() {
  const [version, setVersion] = useState<UuidVersion>("v4");
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [uuids, setUuids] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pasted, setPasted] = useState("");
  const [validation, setValidation] = useState<UuidValidationResult | null>(null);

  function formatOutput(value: string): string {
    const withHyphens = hyphens ? value : uuidToCompact(value);
    return uppercase ? withHyphens.toUpperCase() : withHyphens;
  }

  function handleGenerate() {
    if (count < 1 || count > UTILITY_LIMITS.uuid.maxCount) {
      setError(`La cantidad debe estar entre 1 y ${UTILITY_LIMITS.uuid.maxCount}.`);
      return;
    }
    setError(null);
    const generator = version === "v4" ? generateUuidV4 : () => generateUuidV7();
    const results = Array.from({ length: count }, () => formatOutput(generator()));
    setUuids(results);
  }

  function handleValidate() {
    setValidation(validateUuid(pasted));
  }

  const allText = uuids.join("\n");
  const csvText = ["uuid", ...uuids].join("\n");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="uuid-version" className="mb-1">
            Versión
          </Label>
          <Select value={version} onValueChange={(v) => setVersion(v as UuidVersion)}>
            <SelectTrigger id="uuid-version" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v4">UUID v4 (aleatorio)</SelectItem>
              <SelectItem value="v7">UUID v7 (con marca de tiempo)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="uuid-count" className="mb-1">
            Cantidad
          </Label>
          <Input id="uuid-count" type="number" min={1} max={UTILITY_LIMITS.uuid.maxCount} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={uppercase} onCheckedChange={(c) => setUppercase(Boolean(c))} />
          Mayúsculas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={hyphens} onCheckedChange={(c) => setHyphens(Boolean(c))} />
          Con guiones
        </label>
      </div>

      <Button type="button" onClick={handleGenerate}>
        Generar {count > 1 ? `${count} UUID` : "UUID"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {uuids.length > 0 ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4">
          <ul className="space-y-1">
            {uuids.map((u, i) => (
              <li key={i} className="flex items-center gap-2">
                <code className="break-all text-sm">{u}</code>
                <CopyButton text={u} label="Copiar" />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            <CopyButton text={allText} label="Copiar todos" />
            <DownloadButton content={allText} filename="uuids.txt" mimeType="text/plain" label="Descargar TXT" />
            <DownloadButton content={csvText} filename="uuids.csv" mimeType="text/csv" label="Descargar CSV" />
            <ResetButton onReset={() => setUuids([])} />
          </div>
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="uuid-validate" className="mb-1">
          Validar un UUID existente
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input id="uuid-validate" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Pega un UUID..." className="max-w-md" />
          <Button type="button" variant="outline" onClick={handleValidate}>
            Validar
          </Button>
        </div>
        {validation ? (
          <p aria-live="polite" className="text-sm">
            {validation.valid ? (
              <>
                ✓ Válido — {validation.variant === "nil" ? "UUID Nil (referencia)" : validation.variant === "max" ? "UUID Max (referencia)" : `versión ${validation.version}, variante ${validation.variant}`}
              </>
            ) : (
              "✗ No es un UUID con formato válido."
            )}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">No se garantiza unicidad absoluta: la probabilidad de colisión de un UUID v4 es extremadamente baja, pero no matemáticamente nula.</p>
    </div>
  );
}

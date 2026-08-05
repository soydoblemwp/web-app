"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { generatePasswords, passwordsToText, type PasswordCategory, type GeneratedPassword } from "@/lib/public-tools/utilities/password-generator";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";

const CATEGORY_LABELS: Record<PasswordCategory, string> = {
  uppercase: "Mayúsculas (A-Z)",
  lowercase: "Minúsculas (a-z)",
  numbers: "Números (0-9)",
  symbols: "Símbolos (!@#...)",
};

export function PasswordGeneratorTool() {
  const [length, setLength] = useState<number>(UTILITY_LIMITS.password.recommendedLength);
  const [categories, setCategories] = useState<PasswordCategory[]>(["uppercase", "lowercase", "numbers", "symbols"]);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [avoidConsecutiveRepeats, setAvoidConsecutiveRepeats] = useState(false);
  const [customSymbols, setCustomSymbols] = useState("");
  const [count, setCount] = useState(1);
  const [pronounceable, setPronounceable] = useState(false);
  const [passwords, setPasswords] = useState<GeneratedPassword[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(category: PasswordCategory) {
    setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  }

  function handleGenerate() {
    const result = generatePasswords({
      length,
      categories,
      excludeAmbiguous,
      avoidConsecutiveRepeats,
      customSymbols: customSymbols.trim() ? customSymbols.trim() : null,
      count,
      pronounceable,
    });
    if (!result.ok) {
      setError(result.error ?? "No se pudieron generar las contraseñas.");
      setPasswords([]);
      return;
    }
    setError(null);
    setPasswords(result.passwords);
  }

  function handleReset() {
    setPasswords([]);
    setError(null);
  }

  const allText = passwordsToText(passwords);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="password-length" className="mb-1">
            Longitud: {length} caracteres
          </Label>
          <Input
            id="password-length"
            type="range"
            min={UTILITY_LIMITS.password.minLength}
            max={UTILITY_LIMITS.password.maxLength}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-muted-foreground">Recomendado: {UTILITY_LIMITS.password.recommendedLength} o más. Prioriza la longitud sobre la complejidad.</p>
        </div>
        <div>
          <Label htmlFor="password-count" className="mb-1">
            Cantidad de contraseñas
          </Label>
          <Input
            id="password-count"
            type="number"
            min={1}
            max={UTILITY_LIMITS.password.maxCount}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
      </div>

      <fieldset className="space-y-2" disabled={pronounceable && false}>
        <legend className="text-sm font-medium">Categorías de caracteres</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CATEGORY_LABELS) as PasswordCategory[]).map((category) => (
            <label key={category} className="group flex items-center gap-2 text-sm">
              <Checkbox checked={categories.includes(category)} onCheckedChange={() => toggleCategory(category)} />
              {CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={excludeAmbiguous} onCheckedChange={(c) => setExcludeAmbiguous(Boolean(c))} />
          Excluir caracteres ambiguos (0, O, 1, l, I...)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={avoidConsecutiveRepeats} onCheckedChange={(c) => setAvoidConsecutiveRepeats(Boolean(c))} />
          Evitar caracteres repetidos consecutivos
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={pronounceable} onCheckedChange={(c) => setPronounceable(Boolean(c))} />
          Modo pronunciable (sílabas consonante-vocal; menor entropía que el modo aleatorio, ver aviso abajo)
        </label>
      </div>

      {!pronounceable ? (
        <div>
          <Label htmlFor="custom-symbols" className="mb-1">
            Símbolos personalizados (opcional, sustituye a los símbolos por defecto)
          </Label>
          <Input id="custom-symbols" value={customSymbols} onChange={(e) => setCustomSymbols(e.target.value)} placeholder="Ej. !@#$%" maxLength={64} />
        </div>
      ) : null}

      <Button type="button" onClick={handleGenerate}>
        Generar {count > 1 ? `${count} contraseñas` : "contraseña"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {passwords.length > 0 ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4">
          <ul className="space-y-2">
            {passwords.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-muted px-2 py-1 text-sm">{p.value}</code>
                <span className="text-xs text-muted-foreground">{p.length} caracteres</span>
                <CopyButton text={p.value} label="Copiar" />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            <CopyButton text={allText} label="Copiar todas" />
            <DownloadButton content={allText} filename="contrasenas.txt" mimeType="text/plain" label="Descargar TXT" />
            <ResetButton onReset={handleReset} />
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Buenas prácticas</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Prioriza la longitud sobre la complejidad.</li>
          <li>Usa una contraseña distinta y única para cada servicio.</li>
          <li>Guarda tus contraseñas en un administrador de contraseñas en lugar de memorizarlas.</li>
          <li>No reutilices contraseñas entre cuentas.</li>
          <li>Evita datos personales (fechas, nombres) en tus contraseñas.</li>
          <li>Activa la autenticación multifactor cuando esté disponible.</li>
        </ul>
        <p className="mt-2">
          Ninguna contraseña generada aquí es invulnerable o imposible de descifrar; una longitud y aleatoriedad altas la hacen muy resistente, no absolutamente segura.
        </p>
      </div>

      <p className="text-sm">
        ¿Quieres comprobar una contraseña existente?{" "}
        <Link href="/herramientas/comprobar-fortaleza-contrasena" className="underline">
          Usa el analizador de fortaleza de contraseñas
        </Link>
        .
      </p>
    </div>
  );
}

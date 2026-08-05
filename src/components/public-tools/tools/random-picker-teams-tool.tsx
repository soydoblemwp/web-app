"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { parseListInput, dedupeList, pickWinners, shuffleList, createTeams, createTeamsBySize, assignTurnOrder, seededPickWinners, seededShuffle } from "@/lib/public-tools/random/picker";
import { downloadTextFile, buildCsv } from "@/lib/public-tools/csv-export";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

type Mode = "pick-one" | "pick-many" | "shuffle" | "teams" | "turns";

export function RandomPickerTeamsTool() {
  const [rawInput, setRawInput] = useState("");
  const [mode, setMode] = useState<Mode>("pick-one");
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [winnerCountRaw, setWinnerCountRaw] = useState("1");
  const [teamCountRaw, setTeamCountRaw] = useState("2");
  const [teamSizeRaw, setTeamSizeRaw] = useState("");
  const [excludePrevious, setExcludePrevious] = useState(false);
  const [seedEnabled, setSeedEnabled] = useState(false);
  const [seedRaw, setSeedRaw] = useState("12345");
  const [previousWinners, setPreviousWinners] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "winners" | "shuffle" | "teams" | "turns"; winners?: string[]; shuffled?: string[]; teams?: string[][]; teamNames?: string[]; turns?: string[] } | null>(null);

  function handleFileLoad(files: File[]) {
    files[0]?.text().then((text) => setRawInput((prev) => (prev ? prev + "\n" + text : text)));
  }

  const parsedList = parseListInput(rawInput);
  const list = removeDuplicates ? dedupeList(parsedList) : parsedList;
  const availableList = excludePrevious ? list.filter((item) => !previousWinners.includes(item)) : list;

  function handleRun() {
    setError(null);
    if (availableList.length === 0) {
      setError("La lista está vacía (o todos los elementos ya ganaron esta sesión).");
      return;
    }
    const seed = seedEnabled ? Number(seedRaw) || 0 : null;
    try {
      if (mode === "pick-one" || mode === "pick-many") {
        const count = mode === "pick-one" ? 1 : parseNumericInput(winnerCountRaw, "La cantidad de ganadores").value ?? 1;
        const winners = seed !== null ? seededPickWinners(availableList, count, seed) : pickWinners(availableList, count);
        setResult({ kind: "winners", winners });
        setPreviousWinners((prev) => [...prev, ...winners]);
      } else if (mode === "shuffle") {
        setResult({ kind: "shuffle", shuffled: seed !== null ? seededShuffle(availableList, seed) : shuffleList(availableList) });
      } else if (mode === "teams") {
        const teamSize = parseNumericInput(teamSizeRaw || "0", "El tamaño de equipo");
        const teamCount = parseNumericInput(teamCountRaw || "2", "La cantidad de equipos");
        const built = teamSize.ok && teamSize.value! > 0 ? createTeamsBySize(availableList, teamSize.value!) : createTeams(availableList, teamCount.value ?? 2);
        setResult({ kind: "teams", teams: built.teams, teamNames: built.teamNames });
      } else if (mode === "turns") {
        setResult({ kind: "turns", turns: assignTurnOrder(availableList) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el sorteo.");
    }
  }

  function handleReset() {
    setRawInput("");
    setResult(null);
    setError(null);
    setPreviousWinners([]);
  }

  const resultText = result
    ? result.kind === "winners"
      ? result.winners!.join("\n")
      : result.kind === "shuffle"
        ? result.shuffled!.join("\n")
        : result.kind === "turns"
          ? result.turns!.map((t, i) => `${i + 1}. ${t}`).join("\n")
          : result.teams!.map((team, i) => `${result.teamNames![i]}: ${team.join(", ")}`).join("\n")
    : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Esta herramienta sirve para selecciones informales. No está diseñada para apuestas, loterías oficiales ni decisiones reguladas.
      </p>

      <div>
        <Label htmlFor="picker-input" className="mb-1">
          Lista de opciones (una por línea)
        </Label>
        <textarea id="picker-input" value={rawInput} onChange={(e) => setRawInput(e.target.value)} rows={6} className="w-full rounded-md border p-2 font-mono text-sm" placeholder="Ana&#10;Luis&#10;María" />
        <FileUploadZone accept=".txt,.csv,text/plain" onFilesSelected={handleFileLoad} label="o carga un archivo .txt/.csv" hint="" />
        <p className="mt-1 text-xs text-muted-foreground">{list.length} opción(es) reconocida(s).</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["pick-one", "Elegir uno"],
            ["pick-many", "Elegir varios"],
            ["shuffle", "Ordenar aleatoriamente"],
            ["teams", "Crear equipos"],
            ["turns", "Asignar turnos"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={removeDuplicates} onCheckedChange={(c) => setRemoveDuplicates(Boolean(c))} />
          Eliminar duplicados
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={excludePrevious} onCheckedChange={(c) => setExcludePrevious(Boolean(c))} />
          Excluir ganadores anteriores
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={seedEnabled} onCheckedChange={(c) => setSeedEnabled(Boolean(c))} />
          Modo reproducible (semilla, no criptográfico)
        </label>
      </div>

      {seedEnabled ? (
        <div className="max-w-xs">
          <Label htmlFor="picker-seed" className="mb-1">
            Semilla
          </Label>
          <Input id="picker-seed" value={seedRaw} onChange={(e) => setSeedRaw(e.target.value)} inputMode="numeric" />
        </div>
      ) : null}

      {mode === "pick-many" ? (
        <div className="max-w-xs">
          <Label htmlFor="picker-count" className="mb-1">
            Cantidad de ganadores
          </Label>
          <Input id="picker-count" value={winnerCountRaw} onChange={(e) => setWinnerCountRaw(e.target.value)} inputMode="numeric" />
        </div>
      ) : null}

      {mode === "teams" ? (
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="picker-team-count" className="mb-1">
              Cantidad de equipos
            </Label>
            <Input id="picker-team-count" value={teamCountRaw} onChange={(e) => setTeamCountRaw(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <Label htmlFor="picker-team-size" className="mb-1">
              O tamaño de equipo (opcional)
            </Label>
            <Input id="picker-team-size" value={teamSizeRaw} onChange={(e) => setTeamSizeRaw(e.target.value)} inputMode="numeric" placeholder="Ej. 4" />
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={handleRun}>
        Sortear
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          {result.kind === "winners" ? <p className="text-lg font-semibold">{result.winners!.join(", ")}</p> : null}
          {result.kind === "shuffle" ? (
            <ol className="list-decimal pl-5 text-sm">
              {result.shuffled!.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          ) : null}
          {result.kind === "turns" ? (
            <ol className="list-decimal pl-5 text-sm">
              {result.turns!.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          ) : null}
          {result.kind === "teams" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.teams!.map((team, i) => (
                <div key={i} className="rounded-md border p-2 text-sm">
                  <p className="font-semibold">{result.teamNames![i]}</p>
                  <ul>
                    {team.map((member, j) => (
                      <li key={j}>{member}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <CopyButton text={resultText} label="Copiar" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("resultado-sorteo.txt", resultText)}>
              Descargar TXT
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTextFile("resultado-sorteo.csv", buildCsv(["Resultado"], resultText.split("\n").map((l) => [l])), "text/csv;charset=utf-8")}
            >
              Descargar CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRun}>
              Volver a sortear
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

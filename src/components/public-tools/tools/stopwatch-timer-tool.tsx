"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { createTimerState, startTimer, pauseTimer, resumeTimer, resetTimer, getElapsedMs, getRemainingMs, formatClock, type TimerState } from "@/lib/public-tools/productivity/timer-engine";
import { recordLap, computeLapStats, lapsToCsv, type Lap } from "@/lib/public-tools/productivity/stopwatch";
import { COUNTDOWN_PRESETS_MS, hmsToMs, msToHms } from "@/lib/public-tools/productivity/countdown";
import { buildIntervalPhases, getSequenceProgress, totalSequenceDurationMs } from "@/lib/public-tools/productivity/intervals";
import { downloadTextFile } from "@/lib/public-tools/csv-export";

type SubMode = "stopwatch" | "countdown" | "intervals";
const TICK_MS = 100;

function useLiveNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), TICK_MS);
    const onFocus = () => setNow(performance.now());
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [active]);
  return now;
}

export function StopwatchTimerTool() {
  const [subMode, setSubMode] = useState<SubMode>("stopwatch");

  // Stopwatch state
  const [swState, setSwState] = useState<TimerState>(createTimerState());
  const [laps, setLaps] = useState<Lap[]>([]);
  const swNow = useLiveNow(swState.status === "running");

  // Countdown state
  const [cdTargetMs, setCdTargetMs] = useState(5 * 60_000);
  const [cdState, setCdState] = useState<TimerState>(createTimerState());
  const [cdFinishedAnnounced, setCdFinishedAnnounced] = useState(false);
  const cdNow = useLiveNow(cdState.status === "running");

  // Intervals state
  const [prepSec, setPrepSec] = useState(10);
  const [workSec, setWorkSec] = useState(30);
  const [restSec, setRestSec] = useState(15);
  const [rounds, setRounds] = useState(4);
  const [ivState, setIvState] = useState<TimerState>(createTimerState());
  const ivNow = useLiveNow(ivState.status === "running");


  const swElapsed = getElapsedMs(swState, swNow);
  const cdRemaining = getRemainingMs(cdState, cdTargetMs, cdNow);
  // React's own "adjusting state during render" pattern (never inside a useEffect, per this
  // project's react-hooks/set-state-in-effect rule) — the countdown reaching zero is detected the
  // moment it's computed from the current tick, instead of one render later via an effect.
  if (cdState.status === "running" && cdRemaining <= 0 && !cdFinishedAnnounced) {
    setCdFinishedAnnounced(true);
    setCdState((s) => ({ ...s, status: "finished" }));
  }
  const phases = buildIntervalPhases({ prepMs: prepSec * 1000, workMs: workSec * 1000, restMs: restSec * 1000, rounds, cooldownMs: 0 });
  const ivElapsed = getElapsedMs(ivState, ivNow);
  const ivProgress = getSequenceProgress(phases, ivElapsed);
  const ivTotal = totalSequenceDurationMs(phases);

  const PHASE_LABELS: Record<string, string> = { prep: "Preparación", work: "Trabajo", rest: "Descanso", cooldown: "Enfriamiento", focus: "Concentración", shortBreak: "Descanso corto", longBreak: "Descanso largo" };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={subMode === "stopwatch" ? "default" : "outline"} onClick={() => setSubMode("stopwatch")}>
          Cronómetro
        </Button>
        <Button type="button" size="sm" variant={subMode === "countdown" ? "default" : "outline"} onClick={() => setSubMode("countdown")}>
          Cuenta regresiva
        </Button>
        <Button type="button" size="sm" variant={subMode === "intervals" ? "default" : "outline"} onClick={() => setSubMode("intervals")}>
          Intervalos
        </Button>
      </div>

      {subMode === "stopwatch" ? (
        <div className="space-y-4">
          <p aria-live="polite" className="text-center font-mono text-5xl">
            {formatClock(swElapsed, true)}
          </p>
          <p className="text-center text-sm text-muted-foreground">Estado: {swState.status === "idle" ? "Inicial" : swState.status === "running" ? "En marcha" : swState.status === "paused" ? "Pausado" : "Detenido"}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {swState.status !== "running" ? (
              <Button type="button" onClick={() => setSwState((s) => (s.status === "paused" ? resumeTimer(s, performance.now()) : startTimer(s, performance.now())))}>
                {swState.status === "paused" ? "Continuar" : "Iniciar"}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setSwState((s) => pauseTimer(s, performance.now()))}>
                Pausar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setLaps((prev) => recordLap(swState, prev, performance.now()))} disabled={swState.status !== "running"}>
              Vuelta
            </Button>
            <ResetButton
              onReset={() => {
                setSwState(resetTimer());
                setLaps([]);
              }}
            />
          </div>
          {laps.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <CopyButton text={lapsToCsv(laps)} label="Copiar vueltas" />
                <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("vueltas.csv", lapsToCsv(laps), "text/csv;charset=utf-8")}>
                  Descargar CSV
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="text-left">
                      Vuelta
                    </th>
                    <th scope="col" className="text-right">
                      Parcial
                    </th>
                    <th scope="col" className="text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {laps
                    .slice()
                    .reverse()
                    .map((lap) => {
                      const stats = computeLapStats(laps);
                      const isBest = stats.bestLap?.number === lap.number;
                      const isWorst = stats.worstLap?.number === lap.number;
                      return (
                        <tr key={lap.number} className={isBest ? "text-green-600 dark:text-green-400" : isWorst ? "text-red-600 dark:text-red-400" : ""}>
                          <td>#{lap.number}</td>
                          <td className="text-right font-mono">{formatClock(lap.splitMs)}</td>
                          <td className="text-right font-mono">{formatClock(lap.totalMs)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">Promedio: {formatClock(computeLapStats(laps).averageMs)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {subMode === "countdown" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-center gap-2">
            {COUNTDOWN_PRESETS_MS.map((preset) => (
              <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => { setCdTargetMs(preset.ms); setCdState(resetTimer()); setCdFinishedAnnounced(false); }}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            {(["hours", "minutes", "seconds"] as const).map((unit) => {
              const hms = msToHms(cdTargetMs);
              return (
                <div key={unit}>
                  <Label htmlFor={`cd-${unit}`} className="mb-1 text-xs">
                    {unit === "hours" ? "Horas" : unit === "minutes" ? "Minutos" : "Segundos"}
                  </Label>
                  <Input
                    id={`cd-${unit}`}
                    type="number"
                    min={0}
                    className="w-20"
                    value={hms[unit]}
                    onChange={(e) => {
                      const next = { ...hms, [unit]: Number(e.target.value) };
                      setCdTargetMs(hmsToMs(next.hours, next.minutes, next.seconds));
                    }}
                    disabled={cdState.status === "running"}
                  />
                </div>
              );
            })}
          </div>
          <p aria-live="polite" className="text-center font-mono text-5xl">
            {formatClock(cdRemaining, true)}
          </p>
          {cdState.status === "finished" ? (
            <p role="alert" className="text-center text-sm font-semibold text-green-600 dark:text-green-400">
              ¡Tiempo terminado!
            </p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Estado: {cdState.status === "idle" ? "Inicial" : cdState.status === "running" ? "En marcha" : "Pausado"}</p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {cdState.status !== "running" && cdState.status !== "finished" ? (
              <Button type="button" onClick={() => setCdState((s) => (s.status === "paused" ? resumeTimer(s, performance.now()) : startTimer(s, performance.now())))}>
                {cdState.status === "paused" ? "Continuar" : "Iniciar"}
              </Button>
            ) : cdState.status === "running" ? (
              <Button type="button" variant="outline" onClick={() => setCdState((s) => pauseTimer(s, performance.now()))}>
                Pausar
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setCdTargetMs((ms) => ms + 60_000)}>
              +1 min
            </Button>
            <ResetButton
              onReset={() => {
                setCdState(resetTimer());
                setCdFinishedAnnounced(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {subMode === "intervals" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="iv-prep" className="mb-1">
                Preparación (s)
              </Label>
              <Input id="iv-prep" type="number" min={0} value={prepSec} onChange={(e) => setPrepSec(Number(e.target.value))} disabled={ivState.status === "running"} />
            </div>
            <div>
              <Label htmlFor="iv-work" className="mb-1">
                Trabajo (s)
              </Label>
              <Input id="iv-work" type="number" min={1} value={workSec} onChange={(e) => setWorkSec(Number(e.target.value))} disabled={ivState.status === "running"} />
            </div>
            <div>
              <Label htmlFor="iv-rest" className="mb-1">
                Descanso (s)
              </Label>
              <Input id="iv-rest" type="number" min={0} value={restSec} onChange={(e) => setRestSec(Number(e.target.value))} disabled={ivState.status === "running"} />
            </div>
            <div>
              <Label htmlFor="iv-rounds" className="mb-1">
                Rondas
              </Label>
              <Input id="iv-rounds" type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} disabled={ivState.status === "running"} />
            </div>
          </div>
          <p aria-live="polite" className="text-center text-lg font-semibold">
            {ivProgress.completed ? "¡Completado!" : `${PHASE_LABELS[ivProgress.phase.kind]} — ronda ${Math.min(ivProgress.focusSessionsCompleted + 1, rounds)}/${rounds}`}
          </p>
          <p aria-live="polite" className="text-center font-mono text-5xl">
            {formatClock(ivProgress.remainingInPhaseMs, false)}
          </p>
          <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (ivElapsed / Math.max(1, ivTotal)) * 100)}%` }} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {ivState.status !== "running" ? (
              <Button type="button" onClick={() => setIvState((s) => (s.status === "paused" ? resumeTimer(s, performance.now()) : startTimer(s, performance.now())))}>
                {ivState.status === "paused" ? "Continuar" : "Iniciar"}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setIvState((s) => pauseTimer(s, performance.now()))}>
                Pausar
              </Button>
            )}
            <ResetButton onReset={() => setIvState(resetTimer())} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

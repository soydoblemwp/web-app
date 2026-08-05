"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ResetButton } from "@/components/public-tools/copy-download-actions";
import { createTimerState, startTimer, pauseTimer, resumeTimer, resetTimer, getElapsedMs, formatClock, type TimerState } from "@/lib/public-tools/productivity/timer-engine";
import { buildPomodoroPhases, getSequenceProgress } from "@/lib/public-tools/productivity/intervals";

const PHASE_LABELS: Record<string, string> = { focus: "Concentración", shortBreak: "Descanso corto", longBreak: "Descanso largo" };

interface Task {
  id: string;
  text: string;
  done: boolean;
}

export function PomodoroTimerTool() {
  const [focusMin, setFocusMin] = useState(25);
  const [shortBreakMin, setShortBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = useState(4);
  const [totalCycles, setTotalCycles] = useState(8);
  const [autoStartNext, setAutoStartNext] = useState(false);

  const [state, setState] = useState<TimerState>(createTimerState());
  const [now, setNow] = useState(() => performance.now());
  const [currentTask, setCurrentTask] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastAnnouncedPhaseIndex, setLastAnnouncedPhaseIndex] = useState(-1);

  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [state.status]);

  const phases = buildPomodoroPhases({ focusMs: focusMin * 60_000, shortBreakMs: shortBreakMin * 60_000, longBreakMs: longBreakMin * 60_000, sessionsBeforeLongBreak, totalCycles });
  const elapsed = getElapsedMs(state, now);
  const progress = getSequenceProgress(phases, elapsed);

  // React's own "adjusting state during render" pattern (never inside a useEffect, per this
  // project's react-hooks/set-state-in-effect rule) — detects a phase boundary crossing the
  // moment it's computed from the current elapsed time, instead of one render later via an effect.
  if (progress.phaseIndex !== lastAnnouncedPhaseIndex && state.status === "running") {
    setLastAnnouncedPhaseIndex(progress.phaseIndex);
    if (!autoStartNext) setState((s) => pauseTimer(s, performance.now()));
  }

  function handleReset() {
    setState(resetTimer());
    setLastAnnouncedPhaseIndex(-1);
  }

  function addTask() {
    if (!currentTask.trim()) return;
    setTasks((prev) => [...prev, { id: `t-${Date.now()}`, text: currentTask.trim(), done: false }]);
    setCurrentTask("");
  }
  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <Label htmlFor="pom-focus" className="mb-1 text-xs">
            Concentración (min)
          </Label>
          <Input id="pom-focus" type="number" min={1} value={focusMin} onChange={(e) => setFocusMin(Number(e.target.value))} disabled={state.status === "running"} />
        </div>
        <div>
          <Label htmlFor="pom-short" className="mb-1 text-xs">
            Descanso corto (min)
          </Label>
          <Input id="pom-short" type="number" min={1} value={shortBreakMin} onChange={(e) => setShortBreakMin(Number(e.target.value))} disabled={state.status === "running"} />
        </div>
        <div>
          <Label htmlFor="pom-long" className="mb-1 text-xs">
            Descanso largo (min)
          </Label>
          <Input id="pom-long" type="number" min={1} value={longBreakMin} onChange={(e) => setLongBreakMin(Number(e.target.value))} disabled={state.status === "running"} />
        </div>
        <div>
          <Label htmlFor="pom-sessions" className="mb-1 text-xs">
            Sesiones antes de descanso largo
          </Label>
          <Input id="pom-sessions" type="number" min={1} value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} disabled={state.status === "running"} />
        </div>
        <div>
          <Label htmlFor="pom-cycles" className="mb-1 text-xs">
            Ciclos totales
          </Label>
          <Input id="pom-cycles" type="number" min={1} value={totalCycles} onChange={(e) => setTotalCycles(Number(e.target.value))} disabled={state.status === "running"} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={autoStartNext} onCheckedChange={(c) => setAutoStartNext(Boolean(c))} />
        Auto-iniciar la siguiente fase
      </label>

      <div className="rounded-lg border p-6 text-center">
        <p aria-live="polite" className="text-lg font-semibold">
          {progress.completed ? "¡Ciclo completado!" : PHASE_LABELS[progress.phase.kind]}
        </p>
        <p aria-live="polite" className="font-mono text-6xl">
          {formatClock(progress.remainingInPhaseMs, false)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sesión {Math.min(progress.focusSessionsCompleted + 1, totalCycles)} de {totalCycles}
        </p>
        {currentTask || tasks.some((t) => !t.done) ? <p className="mt-1 text-sm">Tarea actual: {tasks.find((t) => !t.done)?.text ?? "—"}</p> : null}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {state.status !== "running" ? (
          <Button
            type="button"
            onClick={() => {
              // A fresh start (not a resume-from-pause) must prime lastAnnouncedPhaseIndex to the
              // phase we're about to enter — otherwise its initial sentinel (-1) never equals the
              // real first phase index (0), and the boundary-detection below fires immediately on
              // the very next render, auto-pausing the timer before any time has actually elapsed.
              if (state.status !== "paused") setLastAnnouncedPhaseIndex(progress.phaseIndex);
              setState((s) => (s.status === "paused" ? resumeTimer(s, performance.now()) : startTimer(s, performance.now())));
            }}
          >
            {state.status === "paused" ? "Continuar" : "Iniciar"}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setState((s) => pauseTimer(s, performance.now()))}>
            Pausar
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            // Omit: jump elapsed time to the start of the next phase boundary.
            const nextPhaseStart = phases.slice(0, progress.phaseIndex + 1).reduce((sum, p) => sum + p.durationMs, 0);
            setState((s) => ({ ...s, accumulatedMs: nextPhaseStart, startedAtMs: s.status === "running" ? performance.now() : null }));
          }}
        >
          Omitir fase
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Tareas de esta sesión</h2>
        <div className="flex gap-2">
          <Label htmlFor="pom-task" className="sr-only">
            Nueva tarea
          </Label>
          <Input
            id="pom-task"
            value={currentTask}
            onChange={(e) => setCurrentTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Añadir tarea..."
          />
          <Button type="button" variant="outline" size="sm" onClick={addTask}>
            Añadir
          </Button>
        </div>
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={t.done} onCheckedChange={() => toggleTask(t.id)} />
              <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Las tareas se mantienen solo en memoria durante esta sesión.</p>
      </div>
    </div>
  );
}

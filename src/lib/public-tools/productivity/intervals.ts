/**
 * Phase-sequence engine shared by the Interval Timer and the Pomodoro timer
 * (spec section 17: "debe reutilizar el mismo núcleo de tiempo... no
 * mantengas dos implementaciones de pausa, reanudación o corrección
 * temporal"). Both tools build a flat list of phases up front, then derive
 * "which phase, how far into it" purely from the single running total
 * elapsed time reported by `timer-engine.ts` — no separate phase-local
 * timer/pause state to keep in sync.
 */
export type PhaseKind = "prep" | "work" | "rest" | "cooldown" | "focus" | "shortBreak" | "longBreak";

export interface PhaseDef {
  kind: PhaseKind;
  durationMs: number;
}

export interface IntervalPlanInput {
  prepMs: number;
  workMs: number;
  restMs: number;
  rounds: number;
  cooldownMs: number;
}

export function buildIntervalPhases(input: IntervalPlanInput): PhaseDef[] {
  const phases: PhaseDef[] = [];
  if (input.prepMs > 0) phases.push({ kind: "prep", durationMs: input.prepMs });
  for (let i = 0; i < input.rounds; i++) {
    phases.push({ kind: "work", durationMs: input.workMs });
    if (i < input.rounds - 1 && input.restMs > 0) phases.push({ kind: "rest", durationMs: input.restMs });
  }
  if (input.cooldownMs > 0) phases.push({ kind: "cooldown", durationMs: input.cooldownMs });
  return phases;
}

export interface PomodoroPlanInput {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  sessionsBeforeLongBreak: number;
  totalCycles: number;
}

export function buildPomodoroPhases(input: PomodoroPlanInput): PhaseDef[] {
  const phases: PhaseDef[] = [];
  for (let i = 0; i < input.totalCycles; i++) {
    phases.push({ kind: "focus", durationMs: input.focusMs });
    const isLast = i === input.totalCycles - 1;
    if (!isLast) {
      const completedFocusSessions = i + 1;
      const isLongBreak = input.sessionsBeforeLongBreak > 0 && completedFocusSessions % input.sessionsBeforeLongBreak === 0;
      phases.push({ kind: isLongBreak ? "longBreak" : "shortBreak", durationMs: isLongBreak ? input.longBreakMs : input.shortBreakMs });
    }
  }
  return phases;
}

export interface SequenceProgress {
  phaseIndex: number;
  phase: PhaseDef;
  elapsedInPhaseMs: number;
  remainingInPhaseMs: number;
  completed: boolean;
  totalPhases: number;
  focusSessionsCompleted: number;
}

export function getSequenceProgress(phases: PhaseDef[], totalElapsedMs: number): SequenceProgress {
  let acc = 0;
  let focusSessionsCompleted = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (totalElapsedMs < acc + phase.durationMs) {
      return { phaseIndex: i, phase, elapsedInPhaseMs: totalElapsedMs - acc, remainingInPhaseMs: acc + phase.durationMs - totalElapsedMs, completed: false, totalPhases: phases.length, focusSessionsCompleted };
    }
    if (phase.kind === "focus" || phase.kind === "work") focusSessionsCompleted++;
    acc += phase.durationMs;
  }
  const last = phases[phases.length - 1];
  return { phaseIndex: Math.max(0, phases.length - 1), phase: last, elapsedInPhaseMs: last?.durationMs ?? 0, remainingInPhaseMs: 0, completed: true, totalPhases: phases.length, focusSessionsCompleted };
}

export function totalSequenceDurationMs(phases: PhaseDef[]): number {
  return phases.reduce((sum, p) => sum + p.durationMs, 0);
}

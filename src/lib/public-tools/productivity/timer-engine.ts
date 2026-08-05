/**
 * Shared drift-resistant timer core for the stopwatch, countdown, interval
 * timer, and Pomodoro tool — a single engine, never three separate
 * pause/resume/correction implementations (spec sections 16/17: "no
 * mantengas dos implementaciones de pausa, reanudación o corrección
 * temporal").
 *
 * Elapsed time is always derived from real timestamps
 * (`accumulatedMs + (now - startedAtMs)`), never from counting how many
 * times a `setInterval` callback fired — so a throttled/backgrounded tab
 * that misses ticks still reports the CORRECT elapsed time the moment a
 * tick (or a focus-regain check) finally runs, instead of drifting behind
 * (spec section 16: "no acumules tiempo confiando solamente en el número de
 * ejecuciones de setInterval()"). Callers should pass `performance.now()`
 * in the browser; a fake clock function is passed in tests instead.
 */
export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerState {
  status: TimerStatus;
  startedAtMs: number | null;
  accumulatedMs: number;
}

export function createTimerState(): TimerState {
  return { status: "idle", startedAtMs: null, accumulatedMs: 0 };
}

export function startTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status === "running") return state;
  return { status: "running", startedAtMs: nowMs, accumulatedMs: state.accumulatedMs };
}

export function pauseTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== "running" || state.startedAtMs === null) return state;
  return { status: "paused", startedAtMs: null, accumulatedMs: state.accumulatedMs + (nowMs - state.startedAtMs) };
}

export function resumeTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== "paused") return state;
  return { status: "running", startedAtMs: nowMs, accumulatedMs: state.accumulatedMs };
}

export function resetTimer(): TimerState {
  return createTimerState();
}

export function finishTimer(state: TimerState, nowMs: number): TimerState {
  return { status: "finished", startedAtMs: null, accumulatedMs: getElapsedMs(state, nowMs) };
}

/** The single source of truth for "how much time has really passed" — always recomputed from timestamps, safe to call from a slow/throttled interval or a focus-regain handler alike. */
export function getElapsedMs(state: TimerState, nowMs: number): number {
  if (state.status === "running" && state.startedAtMs !== null) {
    return state.accumulatedMs + Math.max(0, nowMs - state.startedAtMs);
  }
  return state.accumulatedMs;
}

export function addElapsedMs(state: TimerState, deltaMs: number): TimerState {
  return { ...state, accumulatedMs: state.accumulatedMs + deltaMs };
}

/** For a countdown: remaining time given a fixed target duration, clamped to zero, never negative. */
export function getRemainingMs(state: TimerState, targetMs: number, nowMs: number): number {
  return Math.max(0, targetMs - getElapsedMs(state, nowMs));
}

export function formatClock(ms: number, showHours = false): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((Math.max(0, ms) % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = showHours || hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return `${base}.${pad(centis)}`;
}

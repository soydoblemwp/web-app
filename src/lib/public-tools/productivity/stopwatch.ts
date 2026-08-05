import { getElapsedMs, type TimerState } from "./timer-engine";

export interface Lap {
  number: number;
  splitMs: number; // time since the previous lap
  totalMs: number; // total elapsed at the moment of this lap
}

export function recordLap(state: TimerState, existingLaps: Lap[], nowMs: number): Lap[] {
  const totalMs = getElapsedMs(state, nowMs);
  const previousTotal = existingLaps[existingLaps.length - 1]?.totalMs ?? 0;
  return [...existingLaps, { number: existingLaps.length + 1, splitMs: totalMs - previousTotal, totalMs }];
}

export interface LapStats {
  bestLap: Lap | null;
  worstLap: Lap | null;
  averageMs: number;
}

export function computeLapStats(laps: Lap[]): LapStats {
  if (laps.length === 0) return { bestLap: null, worstLap: null, averageMs: 0 };
  let best = laps[0];
  let worst = laps[0];
  let sum = 0;
  for (const lap of laps) {
    if (lap.splitMs < best.splitMs) best = lap;
    if (lap.splitMs > worst.splitMs) worst = lap;
    sum += lap.splitMs;
  }
  return { bestLap: best, worstLap: worst, averageMs: sum / laps.length };
}

export function lapsToCsv(laps: Lap[]): string {
  const header = "Vuelta,Parcial (ms),Total (ms)";
  const rows = laps.map((l) => `${l.number},${l.splitMs},${l.totalMs}`);
  return [header, ...rows].join("\n");
}

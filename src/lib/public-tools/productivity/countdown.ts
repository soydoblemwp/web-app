export const COUNTDOWN_PRESETS_MS = [
  { label: "1 min", ms: 60_000 },
  { label: "5 min", ms: 5 * 60_000 },
  { label: "10 min", ms: 10 * 60_000 },
  { label: "20 min", ms: 20 * 60_000 },
];

export function hmsToMs(hours: number, minutes: number, seconds: number): number {
  return Math.max(0, hours) * 3_600_000 + Math.max(0, minutes) * 60_000 + Math.max(0, seconds) * 1000;
}

export function msToHms(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.round(Math.max(0, ms) / 1000);
  return { hours: Math.floor(totalSeconds / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 };
}

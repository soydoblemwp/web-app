/**
 * Pure scheduling helpers. `scheduledAt` is always stored/compared in UTC
 * (a plain Date/Timestamp) — `timezone` is kept alongside purely for
 * DISPLAY (converting back to the user's original local time), never used
 * to shift the stored instant. See SocialPost.scheduledAt/timezone.
 */
export function isPastSchedule(scheduledAt: Date, now: Date = new Date()): boolean {
  return scheduledAt.getTime() < now.getTime();
}

export interface ScheduleConflictCandidate {
  id: string;
  platform: string;
  scheduledAt: Date;
}

/** Two posts on the SAME platform scheduled within `windowMinutes` of each other are flagged as a conflict — a warning, not a hard block (mirrors the composer's non-blocking-warning philosophy). */
export function findSchedulingConflicts(
  candidate: { platform: string; scheduledAt: Date; excludeId?: string },
  existing: ScheduleConflictCandidate[],
  windowMinutes = 5
): ScheduleConflictCandidate[] {
  const windowMs = windowMinutes * 60 * 1000;
  return existing.filter((post) => {
    if (post.id === candidate.excludeId) return false;
    if (post.platform !== candidate.platform) return false;
    return Math.abs(post.scheduledAt.getTime() - candidate.scheduledAt.getTime()) <= windowMs;
  });
}

/** Converts a UTC instant to the equivalent wall-clock string in `timezone`, for display only. Falls back to the raw ISO string if the timezone id is invalid, never throws. */
export function formatInTimezone(date: Date, timezone: string, locale = "es-ES"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

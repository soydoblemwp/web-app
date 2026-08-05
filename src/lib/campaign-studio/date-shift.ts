/**
 * Recalculates a date's offset from an old campaign start date onto a new
 * one — used when duplicating a campaign or instantiating a template, per
 * spec: "recalcula fechas desde la nueva fecha inicial" (never copies old
 * dates literally).
 */
export function shiftDate(originalDate: Date, originalStart: Date, newStart: Date): Date {
  const offsetMs = originalDate.getTime() - originalStart.getTime();
  return new Date(newStart.getTime() + offsetMs);
}

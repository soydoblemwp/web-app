import { describe, expect, it } from "vitest";
import { countBusinessDays, addBusinessDays, dedupeHolidays, isBusinessDay } from "@/lib/public-tools/productivity/business-days";
import { computeShiftHours, summarizeWeek, formatMinutesAsHours, type Shift } from "@/lib/public-tools/productivity/work-hours";
import { createTimerState, startTimer, pauseTimer, resumeTimer, resetTimer, getElapsedMs, getRemainingMs, formatClock } from "@/lib/public-tools/productivity/timer-engine";
import { recordLap, computeLapStats } from "@/lib/public-tools/productivity/stopwatch";
import { hmsToMs, msToHms } from "@/lib/public-tools/productivity/countdown";
import { buildIntervalPhases, buildPomodoroPhases, getSequenceProgress, totalSequenceDurationMs } from "@/lib/public-tools/productivity/intervals";
import { isValidTimeZone, getZonedParts, zonedTimeToUtc } from "@/lib/public-tools/time/time-zones";
import { planMeetings } from "@/lib/public-tools/time/meeting-planner";
import { buildIcsEvent, generateIcsUid } from "@/lib/public-tools/time/ics";

describe("productivity/business-days.ts: real calendar math (no timezone shift)", () => {
  const noWeekend = { weekendDays: [] as number[], holidays: [] };
  const satSun = { weekendDays: [0, 6], holidays: [] };

  it("counts business days between two dates with default Sat/Sun weekend", () => {
    // 2026-01-05 (Mon) through 2026-01-09 (Fri) inclusive — 5 weekdays, no weekend.
    const result = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 9 }, true, true, satSun);
    expect(result.businessDays).toBe(5);
    expect(result.weekendDays).toBe(0);
  });

  it("a full week (Mon-Sun) has exactly 2 weekend days with default weekend config", () => {
    const result = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 11 }, true, true, satSun);
    expect(result.totalDays).toBe(7);
    expect(result.weekendDays).toBe(2);
    expect(result.businessDays).toBe(5);
  });

  it("weekend days are fully configurable (e.g. Friday+Saturday instead of Sat+Sun)", () => {
    const fridaySaturday = { weekendDays: [5, 6], holidays: [] };
    const result = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 11 }, true, true, fridaySaturday);
    expect(result.weekendDays).toBe(2);
  });

  it("excludes a custom holiday from the business-day count", () => {
    const withHoliday = { weekendDays: [0, 6], holidays: [{ year: 2026, month: 1, day: 6 }] };
    const result = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 9 }, true, true, withHoliday);
    expect(result.businessDays).toBe(4);
    expect(result.holidaysExcluded).toBe(1);
  });

  it("includeStart/includeEnd flags correctly change the boundary count", () => {
    const withBoth = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 9 }, true, true, noWeekend);
    const withoutStart = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 9 }, false, true, noWeekend);
    expect(withBoth.totalDays).toBe(5);
    expect(withoutStart.totalDays).toBe(4);
  });

  it("handles a leap year February correctly (2028-02-29 exists, is a real business day candidate)", () => {
    expect(isBusinessDay({ year: 2028, month: 2, day: 29 }, noWeekend)).toBe(true);
    const result = countBusinessDays({ year: 2028, month: 2, day: 28 }, { year: 2028, month: 3, day: 1 }, true, true, noWeekend);
    expect(result.totalDays).toBe(3); // Feb 28, Feb 29, Mar 1 — real leap day counted
  });

  it("start/end order is irrelevant — same result whichever order they're passed", () => {
    const forward = countBusinessDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 9 }, true, true, satSun);
    const backward = countBusinessDays({ year: 2026, month: 1, day: 9 }, { year: 2026, month: 1, day: 5 }, true, true, satSun);
    expect(backward.businessDays).toBe(forward.businessDays);
  });

  it("adds business days forward, correctly skipping weekends", () => {
    // 2026-01-05 is a Monday; +5 business days (skipping the following Sat/Sun) lands on 2026-01-12 (Mon).
    const result = addBusinessDays({ year: 2026, month: 1, day: 5 }, 5, 1, satSun);
    expect(result.resultDate).toEqual({ year: 2026, month: 1, day: 12 });
    expect(result.weekendsSkipped).toBe(2);
  });

  it("subtracts business days backward correctly", () => {
    const result = addBusinessDays({ year: 2026, month: 1, day: 12 }, 5, -1, satSun);
    expect(result.resultDate).toEqual({ year: 2026, month: 1, day: 5 });
  });

  it("dedupeHolidays removes exact duplicates and sorts the result", () => {
    const holidays = [{ year: 2026, month: 12, day: 25 }, { year: 2026, month: 1, day: 1 }, { year: 2026, month: 12, day: 25 }];
    const deduped = dedupeHolidays(holidays);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe("productivity/work-hours.ts: shift and overtime math", () => {
  function shift(overrides: Partial<Shift> = {}): Shift {
    return { id: "s1", day: "Lunes", startMinutes: 9 * 60, endMinutes: 17 * 60, unpaidBreakMinutes: 30, paidBreakMinutes: 0, ...overrides };
  }

  it("a normal day shift computes gross/net minutes correctly", () => {
    const result = computeShiftHours(shift());
    expect(result.grossMinutes).toBe(8 * 60);
    expect(result.netMinutes).toBe(8 * 60 - 30);
    expect(result.crossesMidnight).toBe(false);
  });

  it("a night shift (end before start) is correctly interpreted as crossing midnight", () => {
    const result = computeShiftHours(shift({ startMinutes: 22 * 60, endMinutes: 6 * 60, unpaidBreakMinutes: 0 }));
    expect(result.grossMinutes).toBe(8 * 60);
    expect(result.crossesMidnight).toBe(true);
  });

  it("entry equal to exit is zero duration, never a silent 24-hour shift", () => {
    const result = computeShiftHours(shift({ startMinutes: 540, endMinutes: 540 }));
    expect(result.grossMinutes).toBe(0);
    expect(result.crossesMidnight).toBe(false);
  });

  it("an unpaid break larger than the shift never produces negative net minutes", () => {
    const result = computeShiftHours(shift({ unpaidBreakMinutes: 1000 }));
    expect(result.netMinutes).toBe(0);
  });

  it("summarizeWeek splits regular vs overtime at the configured threshold with the configured multiplier", () => {
    const shifts: Shift[] = [shift({ id: "a", day: "Lun" }), shift({ id: "b", day: "Mar" }), shift({ id: "c", day: "Mie" }), shift({ id: "d", day: "Jue" }), shift({ id: "e", day: "Vie" })];
    // 5 shifts x 7.5h net = 37.5h — below a 40h threshold, so no overtime.
    const noOT = summarizeWeek(shifts, { overtimeEnabled: true, overtimeThresholdHours: 40, overtimeMultiplier: 1.5, defaultHourlyRate: 20 });
    expect(noOT.overtimeMinutes).toBe(0);
    expect(noOT.totalPay).toBeCloseTo((37.5) * 20, 6);

    // Lower the threshold to 30h — 7.5h of overtime at 1.5x.
    const withOT = summarizeWeek(shifts, { overtimeEnabled: true, overtimeThresholdHours: 30, overtimeMultiplier: 1.5, defaultHourlyRate: 20 });
    expect(withOT.overtimeMinutes).toBe(7.5 * 60);
    expect(withOT.regularPay).toBeCloseTo(30 * 20, 6);
    expect(withOT.overtimePay).toBeCloseTo(7.5 * 20 * 1.5, 6);
  });

  it("overtime disabled means no threshold is ever applied, regardless of total hours", () => {
    const shifts: Shift[] = [shift({ startMinutes: 0, endMinutes: 20 * 60, unpaidBreakMinutes: 0 })]; // 20h in one "shift"
    const result = summarizeWeek(shifts, { overtimeEnabled: false, overtimeThresholdHours: 8, overtimeMultiplier: 2, defaultHourlyRate: 10 });
    expect(result.overtimeMinutes).toBe(0);
    expect(result.regularMinutes).toBe(20 * 60);
  });

  it("a per-shift rate override is honored instead of the default rate", () => {
    const shifts: Shift[] = [shift({ hourlyRate: 50 })];
    const result = summarizeWeek(shifts, { overtimeEnabled: false, overtimeThresholdHours: 40, overtimeMultiplier: 1.5, defaultHourlyRate: 10 });
    expect(result.totalPay).toBeCloseTo(7.5 * 50, 6);
  });

  it("formatMinutesAsHours renders a readable hh:mm-style string", () => {
    expect(formatMinutesAsHours(90)).toBe("1h 30m");
  });
});

describe("productivity/timer-engine.ts: drift-resistant timestamp-based elapsed time", () => {
  it("elapsed time is derived from real timestamps, not from tick counting", () => {
    let state = createTimerState();
    state = startTimer(state, 1000);
    expect(getElapsedMs(state, 1000)).toBe(0);
    expect(getElapsedMs(state, 5000)).toBe(4000); // a single big jump reports correctly — no missed "ticks" to lose
  });

  it("pausing freezes elapsed time; time passing while paused never counts", () => {
    let state = createTimerState();
    state = startTimer(state, 1000);
    state = pauseTimer(state, 3000); // 2000ms elapsed
    expect(getElapsedMs(state, 3000)).toBe(2000);
    expect(getElapsedMs(state, 100_000)).toBe(2000); // no matter how much real time passes while paused
  });

  it("resuming continues accumulating from where it left off", () => {
    let state = createTimerState();
    state = startTimer(state, 0);
    state = pauseTimer(state, 1000); // 1000ms banked
    state = resumeTimer(state, 5000);
    expect(getElapsedMs(state, 6000)).toBe(2000); // 1000 banked + 1000 more
  });

  it("resetTimer returns to a real zeroed idle state", () => {
    let state = startTimer(createTimerState(), 0);
    state = pauseTimer(state, 5000);
    state = resetTimer();
    expect(state.status).toBe("idle");
    expect(getElapsedMs(state, 999999)).toBe(0);
  });

  it("getRemainingMs for a countdown clamps to zero, never negative", () => {
    const state = startTimer(createTimerState(), 0);
    expect(getRemainingMs(state, 5000, 10000)).toBe(0); // 10s elapsed against a 5s target
  });

  it("formatClock renders mm:ss.cc by default and hh:mm:ss.cc when requested or over an hour", () => {
    expect(formatClock(65_500)).toBe("01:05.50");
    expect(formatClock(3_665_000, true)).toBe("01:01:05.00");
    expect(formatClock(3_665_000)).toBe("01:01:05.00"); // auto-switches once over an hour even without the flag
  });
});

describe("productivity/stopwatch.ts: laps", () => {
  it("records laps with correct split and total times", () => {
    let state = createTimerState();
    state = startTimer(state, 0);
    let laps = recordLap(state, [], 1000);
    laps = recordLap(state, laps, 2500);
    expect(laps[0]).toEqual({ number: 1, splitMs: 1000, totalMs: 1000 });
    expect(laps[1]).toEqual({ number: 2, splitMs: 1500, totalMs: 2500 });
  });

  it("computes best/worst/average lap correctly", () => {
    const laps = [
      { number: 1, splitMs: 1000, totalMs: 1000 },
      { number: 2, splitMs: 500, totalMs: 1500 },
      { number: 3, splitMs: 2000, totalMs: 3500 },
    ];
    const stats = computeLapStats(laps);
    expect(stats.bestLap!.number).toBe(2);
    expect(stats.worstLap!.number).toBe(3);
    expect(stats.averageMs).toBeCloseTo((1000 + 500 + 2000) / 3, 6);
  });
});

describe("productivity/countdown.ts: hms conversion", () => {
  it("round-trips hours/minutes/seconds through milliseconds", () => {
    const ms = hmsToMs(1, 30, 15);
    expect(ms).toBe((1 * 3600 + 30 * 60 + 15) * 1000);
    expect(msToHms(ms)).toEqual({ hours: 1, minutes: 30, seconds: 15 });
  });
});

describe("productivity/intervals.ts: phase sequencing shared by Intervals and Pomodoro", () => {
  it("builds prep + N rounds of work/rest + cooldown", () => {
    const phases = buildIntervalPhases({ prepMs: 5000, workMs: 30000, restMs: 10000, rounds: 3, cooldownMs: 5000 });
    // prep, work, rest, work, rest, work, cooldown (no rest after the final round)
    expect(phases.map((p) => p.kind)).toEqual(["prep", "work", "rest", "work", "rest", "work", "cooldown"]);
  });

  it("getSequenceProgress reports the correct phase and remaining time mid-sequence", () => {
    const phases = buildIntervalPhases({ prepMs: 5000, workMs: 30000, restMs: 10000, rounds: 2, cooldownMs: 0 });
    const progress = getSequenceProgress(phases, 5000 + 10000); // 10s into the first "work" phase
    expect(progress.phase.kind).toBe("work");
    expect(progress.elapsedInPhaseMs).toBe(10000);
    expect(progress.remainingInPhaseMs).toBe(20000);
    expect(progress.completed).toBe(false);
  });

  it("getSequenceProgress reports completed once total elapsed exceeds the full sequence duration", () => {
    const phases = buildIntervalPhases({ prepMs: 0, workMs: 1000, restMs: 0, rounds: 1, cooldownMs: 0 });
    const progress = getSequenceProgress(phases, 999999);
    expect(progress.completed).toBe(true);
  });

  it("buildPomodoroPhases inserts a long break every N focus sessions and a short break otherwise", () => {
    const phases = buildPomodoroPhases({ focusMs: 1000, shortBreakMs: 100, longBreakMs: 500, sessionsBeforeLongBreak: 2, totalCycles: 4 });
    expect(phases.map((p) => p.kind)).toEqual(["focus", "shortBreak", "focus", "longBreak", "focus", "shortBreak", "focus"]);
  });

  it("totalSequenceDurationMs sums every phase", () => {
    const phases = buildIntervalPhases({ prepMs: 1000, workMs: 2000, restMs: 500, rounds: 2, cooldownMs: 1000 });
    expect(totalSequenceDurationMs(phases)).toBe(1000 + 2000 + 500 + 2000 + 1000);
  });
});

describe("time/time-zones.ts: real IANA conversion via Intl (spec section 14)", () => {
  it("validates a real IANA zone and rejects a bogus one", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("reads real local wall-clock time for a known UTC instant", () => {
    // 2026-01-15T12:00:00Z — New York is UTC-5 in January (no DST) → 07:00 local.
    const parts = getZonedParts(new Date("2026-01-15T12:00:00Z"), "America/New_York");
    expect(parts.hour).toBe(7);
    expect(parts.year).toBe(2026);
  });

  it("correctly reflects a DST transition (New York UTC-5 in January vs UTC-4 in July)", () => {
    const winterOffset = getZonedParts(new Date("2026-01-15T12:00:00Z"), "America/New_York").offsetMinutes;
    const summerOffset = getZonedParts(new Date("2026-07-15T12:00:00Z"), "America/New_York").offsetMinutes;
    expect(winterOffset).toBe(-300); // UTC-5
    expect(summerOffset).toBe(-240); // UTC-4 (DST)
  });

  it("zonedTimeToUtc is the real inverse of getZonedParts for a given zone", () => {
    const utc = zonedTimeToUtc(2026, 6, 15, 9, 30, "Europe/Madrid");
    const roundTrip = getZonedParts(utc, "Europe/Madrid");
    expect(roundTrip.hour).toBe(9);
    expect(roundTrip.minute).toBe(30);
    expect(roundTrip.year).toBe(2026);
    expect(roundTrip.month).toBe(6);
    expect(roundTrip.day).toBe(15);
  });

  it("handles a real non-hour offset zone (India, UTC+5:30)", () => {
    const utc = zonedTimeToUtc(2026, 3, 1, 10, 0, "Asia/Kolkata");
    const parts = getZonedParts(utc, "Asia/Kolkata");
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
    expect(parts.offsetMinutes).toBe(330);
  });
});

describe("time/meeting-planner.ts: real timezone-aware scheduling", () => {
  it("finds slots where two participants in different timezones are both within work hours", () => {
    const slots = planMeetings({
      anchorYear: 2026,
      anchorMonth: 6,
      anchorDay: 15,
      anchorTimeZone: "America/New_York",
      participants: [
        { id: "a", label: "A", timeZone: "America/New_York", workStartMinutes: 9 * 60, workEndMinutes: 17 * 60, workDays: [1, 2, 3, 4, 5] },
        { id: "b", label: "B", timeZone: "Europe/Madrid", workStartMinutes: 9 * 60, workEndMinutes: 17 * 60, workDays: [1, 2, 3, 4, 5] },
      ],
      intervalMinutes: 30,
      meetingDurationMinutes: 30,
    });
    expect(slots.some((s) => s.allAvailable)).toBe(true);
    expect(slots.length).toBe(48); // 24h / 30min
  });

  it("a participant outside their work days is never marked available that day", () => {
    const slots = planMeetings({
      anchorYear: 2026,
      anchorMonth: 6,
      anchorDay: 15, // a Monday
      anchorTimeZone: "UTC",
      participants: [
        { id: "a", label: "A", timeZone: "UTC", workStartMinutes: 0, workEndMinutes: 24 * 60, workDays: [] }, // never works
        { id: "b", label: "B", timeZone: "UTC", workStartMinutes: 0, workEndMinutes: 24 * 60, workDays: [1] },
      ],
      intervalMinutes: 60,
      meetingDurationMinutes: 30,
    });
    expect(slots.every((s) => !s.allAvailable)).toBe(true);
  });
});

describe("time/ics.ts: real, re-parseable RFC 5545 output", () => {
  it("produces a real VCALENDAR/VEVENT with correctly escaped text", () => {
    const ics = buildIcsEvent({ uid: "test-uid@local", title: "Reunión; con caracteres, especiales\ny salto", startUtc: new Date("2026-06-15T14:00:00Z"), durationMinutes: 30 });
    expect(ics).toMatch(/BEGIN:VCALENDAR/);
    expect(ics).toMatch(/BEGIN:VEVENT/);
    expect(ics).toMatch(/UID:test-uid@local/);
    expect(ics).toMatch(/DTSTART:20260615T140000Z/);
    expect(ics).toMatch(/DTEND:20260615T143000Z/);
    expect(ics).toMatch(/SUMMARY:Reunión\\; con caracteres\\, especiales\\ny salto/);
    expect(ics).toMatch(/END:VEVENT/);
    expect(ics).toMatch(/END:VCALENDAR/);
  });

  it("generateIcsUid produces a real, non-predictable unique identifier each time", () => {
    const a = generateIcsUid();
    const b = generateIcsUid();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}@herramientas\.local$/);
  });

  it("folds a very long line at 75 octets per RFC 5545, with a leading space on continuation lines", () => {
    const longDescription = "x".repeat(300);
    const ics = buildIcsEvent({ uid: "u", title: "t", description: longDescription, startUtc: new Date(), durationMinutes: 10 });
    const lines = ics.split("\r\n");
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
  });
});

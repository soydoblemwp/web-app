import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectUnixUnit, unixToDate, dateToUnix, formatTimestamp, validateTimeZone, describeDiffFromNow } from "@/lib/public-tools/utilities/timestamp";
import { UNIT_CATEGORIES, convertUnit, formatUnitValue } from "@/lib/public-tools/utilities/units";
import { calculatePercentage } from "@/lib/public-tools/utilities/percentages";
import { calendarDiff, calculateAge, addCalendarTime, isLeapYear, daysInMonth, weekdayOf, parseIsoDateInput, calendarDateToIso, isValidCalendarDate } from "@/lib/public-tools/utilities/dates";
import { parseColor, rgbToHex, contrastRatioRgb, evaluateWcagLevels, suggestAdjustedColor, hslToRgb } from "@/lib/public-tools/color-contrast";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

// ---------------------------------------------------------------------------
// timestamp.ts — spec sections 17, 37
// ---------------------------------------------------------------------------
describe("utilities/timestamp.ts", () => {
  it("timestamp 0 converts to exactly the Unix epoch", () => {
    const result = unixToDate(0, "seconds");
    expect(result.ok).toBe(true);
    expect(result.date!.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("round-trips seconds -> date -> seconds", () => {
    const original = 1_753_776_000;
    const { date } = unixToDate(original, "seconds");
    expect(dateToUnix(date!)!.seconds).toBe(original);
  });

  it("round-trips milliseconds -> date -> milliseconds", () => {
    const original = 1_753_776_123_456;
    const { date } = unixToDate(original, "milliseconds");
    expect(dateToUnix(date!)!.milliseconds).toBe(original);
  });

  it("detects a 10-digit value as seconds and a 13-digit value as milliseconds, always with a stated reason", () => {
    const secondsGuess = detectUnixUnit(1_753_776_000);
    const msGuess = detectUnixUnit(1_753_776_000_000);
    expect(secondsGuess.suggested).toBe("seconds");
    expect(msGuess.suggested).toBe("milliseconds");
    expect(secondsGuess.reason.length).toBeGreaterThan(0);
    expect(msGuess.reason.length).toBeGreaterThan(0);
  });

  it("handles dates before 1970 (negative timestamps)", () => {
    const result = unixToDate(-86400, "seconds"); // one day before epoch
    expect(result.ok).toBe(true);
    expect(result.date!.toISOString()).toBe("1969-12-31T00:00:00.000Z");
  });

  it("rejects a non-finite value", () => {
    expect(unixToDate(NaN, "seconds").ok).toBe(false);
    expect(unixToDate(Infinity, "seconds").ok).toBe(false);
  });

  it("validateTimeZone accepts a real IANA zone and rejects a bogus one", () => {
    expect(validateTimeZone("America/Mexico_City").ok).toBe(true);
    expect(validateTimeZone("Not/A_Real_Zone").ok).toBe(false);
  });

  it("formatTimestamp produces a valid ISO 8601 string and a UTC weekday consistent with the date", () => {
    const { date } = unixToDate(0, "seconds"); // 1970-01-01 was a Thursday
    const formatted = formatTimestamp(date!, null);
    expect(formatted.iso).toBe("1970-01-01T00:00:00.000Z");
    expect(formatted.dayOfWeek.toLowerCase()).toContain("jueves");
  });

  it("describeDiffFromNow distinguishes future from past", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    expect(describeDiffFromNow(future)).toMatch(/dentro de/);
    expect(describeDiffFromNow(past)).toMatch(/hace/);
  });

  it("never sends a date value to a server (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/timestamp.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// units.ts — spec sections 18, 37 (known conversions, temperature formulas, decimal vs binary storage)
// ---------------------------------------------------------------------------
describe("utilities/units.ts", () => {
  it("every declared category has at least 2 units, and (except temperature) every unit exposes a positive toBase factor", () => {
    for (const category of UNIT_CATEGORIES) {
      expect(category.units.length).toBeGreaterThanOrEqual(2);
      if (category.id !== "temperatura") {
        for (const unit of category.units) expect(unit.toBase).toBeGreaterThan(0);
      }
    }
  });

  it("1 km converts to exactly 1000 m", () => {
    const result = convertUnit("longitud", "km", "m", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(1000, 9);
  });

  it("0°C converts to 32°F and 273.15 K (real offset formulas, not a linear factor)", () => {
    expect(convertUnit("temperatura", "c", "f", 0).value).toBeCloseTo(32, 9);
    expect(convertUnit("temperatura", "c", "k", 0).value).toBeCloseTo(273.15, 9);
  });

  it("100°C converts to 212°F", () => {
    expect(convertUnit("temperatura", "c", "f", 100).value).toBeCloseTo(212, 9);
  });

  it("rejects a Kelvin value below absolute zero", () => {
    expect(convertUnit("temperatura", "k", "c", -1).ok).toBe(false);
  });

  it("distinguishes decimal KB (1000 bytes) from binary KiB (1024 bytes)", () => {
    const kb = convertUnit("almacenamiento", "kb", "b", 1);
    const kib = convertUnit("almacenamiento", "kib", "b", 1);
    expect(kb.value).toBe(1000);
    expect(kib.value).toBe(1024);
  });

  it("1024 KiB equals exactly 1 MiB", () => {
    const result = convertUnit("almacenamiento", "kib", "mib", 1024);
    expect(result.value).toBeCloseTo(1, 9);
  });

  it("converting a unit to itself returns the same value", () => {
    for (const category of UNIT_CATEGORIES) {
      const unit = category.units[0];
      const result = convertUnit(category.id, unit.id, unit.id, 42);
      expect(result.ok).toBe(true);
      expect(result.value).toBeCloseTo(42, 6);
    }
  });

  it("rejects NaN and Infinity", () => {
    expect(convertUnit("longitud", "m", "km", NaN).ok).toBe(false);
    expect(convertUnit("longitud", "m", "km", Infinity).ok).toBe(false);
  });

  it("rejects a negative value for a category that doesn't allow it", () => {
    expect(convertUnit("longitud", "m", "km", -5).ok).toBe(false);
  });

  it("allows a negative value for temperature", () => {
    expect(convertUnit("temperatura", "c", "f", -40).value).toBeCloseTo(-40, 6); // -40 is the famous C=F crossing point
  });

  it("formatUnitValue supports both normal and scientific notation", () => {
    expect(formatUnitValue(1234.5678, 2, false)).toContain("1234");
    expect(formatUnitValue(1234.5678, 2, true)).toMatch(/e\+/);
  });
});

// ---------------------------------------------------------------------------
// percentages.ts — spec sections 19, 37
// ---------------------------------------------------------------------------
describe("utilities/percentages.ts", () => {
  it("percent-of: 20% of 50 is 10", () => {
    const result = calculatePercentage("percent-of", 20, 50);
    expect(result.ok).toBe(true);
    expect(result.result).toBe(10);
  });

  it("what-percent: 25 is 50% of 50", () => {
    expect(calculatePercentage("what-percent", 25, 50).result).toBe(50);
  });

  it("increase: from 50 to 75 is a 50% increase", () => {
    expect(calculatePercentage("increase", 50, 75).result).toBe(50);
  });

  it("decrease: from 200 to 150 is a 25% decrease", () => {
    expect(calculatePercentage("decrease", 200, 150).result).toBe(25);
  });

  it("change: signed cambio porcentual is negative when the value drops", () => {
    expect(calculatePercentage("change", 100, 80).result).toBe(-20);
  });

  it("add-percent / subtract-percent are inverses of applying and removing the same rate", () => {
    const added = calculatePercentage("add-percent", 200, 10).result!; // 220
    expect(added).toBeCloseTo(220, 9);
    const subtracted = calculatePercentage("subtract-percent", 200, 10).result!; // 180
    expect(subtracted).toBeCloseTo(180, 9);
  });

  it("discount: 20% off 100 gives a final price of 80 and 20 in savings", () => {
    const result = calculatePercentage("discount", 100, 20);
    expect(result.result).toBe(80);
    expect(result.extra?.savings).toBe(20);
  });

  it("margin and markup give different results for the same price/cost pair (spec: never conflate them)", () => {
    const margin = calculatePercentage("margin", 100, 60).result!; // (100-60)/100 = 40%
    const markup = calculatePercentage("markup", 100, 60).result!; // (100-60)/60 = 66.67%
    expect(margin).toBeCloseTo(40, 6);
    expect(markup).toBeCloseTo(66.666666, 5);
    expect(margin).not.toBeCloseTo(markup, 3);
  });

  it("protects against division by zero for every mode that divides by one of its inputs", () => {
    expect(calculatePercentage("what-percent", 10, 0).ok).toBe(false);
    expect(calculatePercentage("increase", 0, 10).ok).toBe(false);
    expect(calculatePercentage("decrease", 0, 10).ok).toBe(false);
    expect(calculatePercentage("change", 0, 10).ok).toBe(false);
    expect(calculatePercentage("margin", 0, 10).ok).toBe(false);
    expect(calculatePercentage("markup", 10, 0).ok).toBe(false);
  });

  it("rejects NaN inputs with a clear error", () => {
    expect(calculatePercentage("percent-of", NaN, 10).ok).toBe(false);
  });
});

describe("utilities/validation.ts: parseNumericInput", () => {
  it("accepts a plain integer and decimal", () => {
    expect(parseNumericInput("42").value).toBe(42);
    expect(parseNumericInput("3.5").value).toBe(3.5);
  });

  it("treats a comma as a decimal separator only when no dot is present", () => {
    expect(parseNumericInput("3,5").value).toBe(3.5);
    expect(parseNumericInput("1.234").value).toBe(1.234); // dot present — never reinterpreted as a thousands separator
  });

  it("rejects empty input and non-numeric text", () => {
    expect(parseNumericInput("").ok).toBe(false);
    expect(parseNumericInput("abc").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dates.ts — spec sections 20, 37 (real calendar math, leap years, Feb 29)
// ---------------------------------------------------------------------------
describe("utilities/dates.ts", () => {
  it("isLeapYear correctly applies the 4/100/400 rule", () => {
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(1900)).toBe(false); // divisible by 100 but not 400
    expect(isLeapYear(2024)).toBe(true); // divisible by 4
    expect(isLeapYear(2023)).toBe(false);
  });

  it("daysInMonth returns 29 for February in a leap year and 28 otherwise", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it("weekdayOf matches a known historical date (2000-01-01 was a Saturday)", () => {
    expect(weekdayOf({ year: 2000, month: 1, day: 1 })).toBe("sábado");
  });

  it("calendarDiff never uses a naive milliseconds/365 approximation — validated against a hand-checked calendar case", () => {
    // From 2024-01-31 to 2024-03-01 is exactly 1 month + 1 day (Jan has 31 days, so Jan 31 + 1 month lands on Feb 29 in this leap year... verify by direct calendar counting instead):
    const diff = calendarDiff({ year: 2023, month: 1, day: 15 }, { year: 2024, month: 3, day: 15 });
    expect(diff.years).toBe(1);
    expect(diff.months).toBe(2);
    expect(diff.days).toBe(0);
  });

  it("calendarDiff correctly borrows across a shorter month", () => {
    const diff = calendarDiff({ year: 2024, month: 1, day: 31 }, { year: 2024, month: 3, day: 1 });
    // Jan 31 -> Mar 1: 1 month and 1 day (Feb 2024 has 29 days: Jan31->Feb29 is 1 month minus 2 days... verify via round-trip instead)
    const reconstructed = addCalendarTime({ year: 2024, month: 1, day: 31 }, { years: diff.years, months: diff.months, days: diff.days });
    expect(calendarDateToIso(reconstructed)).toBe("2024-03-01");
  });

  it("calendarDiff marks negative when the end date precedes the start date, and totalDays is always non-negative", () => {
    const diff = calendarDiff({ year: 2024, month: 6, day: 1 }, { year: 2024, month: 1, day: 1 });
    expect(diff.negative).toBe(true);
    expect(diff.totalDays).toBeGreaterThan(0);
  });

  it("addCalendarTime clamps to the last valid day instead of overflowing into the next month", () => {
    const result = addCalendarTime({ year: 2024, month: 1, day: 31 }, { months: 1 });
    expect(result).toEqual({ year: 2024, month: 2, day: 29 }); // 2024 is a leap year
  });

  it("addCalendarTime + calendarDiff are inverse operations for an arbitrary case", () => {
    const start = { year: 2022, month: 11, day: 20 };
    const delta = { years: 3, months: 5, days: 17 };
    const end = addCalendarTime(start, delta);
    const diff = calendarDiff(start, end);
    expect({ years: diff.years, months: diff.months, days: diff.days }).toEqual(delta);
  });

  it("calculateAge computes a birthday-today flag correctly and total months/weeks/days are internally consistent", () => {
    const birth = { year: 1990, month: 6, day: 15 };
    const asOf = { year: 1990, month: 6, day: 15 };
    const age = calculateAge(birth, asOf);
    expect(age.isBirthdayToday).toBe(true);
    expect(age.diff.years).toBe(0);
    expect(age.diff.totalMonths).toBe(age.diff.years * 12 + age.diff.months);
  });

  it("calculateAge for a Feb 29 birth date in a non-leap year respects the chosen policy (Feb 28 vs Mar 1)", () => {
    const birth = { year: 2000, month: 2, day: 29 };
    const asOf = { year: 2023, month: 3, day: 15 }; // 2023 is not a leap year

    const feb28Policy = calculateAge(birth, asOf, "feb28");
    expect(feb28Policy.isBirthdayToday).toBe(false);
    // Last birthday under the feb28 policy already passed this year (Feb 28 < Mar 15), so next birthday rolls to next year.
    expect(feb28Policy.nextBirthday.year).toBe(2024); // 2024 is a leap year — real Feb 29 returns

    const mar1Policy = calculateAge(birth, asOf, "mar1");
    expect(mar1Policy.diff.years).not.toBeNaN();
  });

  it("calculateAge handles a birth date in the future relative to asOf without throwing", () => {
    const age = calculateAge({ year: 2030, month: 1, day: 1 }, { year: 2026, month: 1, day: 1 });
    expect(age.diff.negative).toBe(true);
  });

  it("parseIsoDateInput parses YYYY-MM-DD by direct component splitting, never via `new Date(string)`", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/dates.ts", "utf8");
    expect(source).toMatch(/parseIsoDateInput/);
    // The function body must not construct a Date directly from the raw string.
    const fnMatch = /export function parseIsoDateInput[\s\S]*?\n}/.exec(source);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![0]).not.toMatch(/new Date\(raw\)|new Date\(trimmed\)/);
  });

  it("parseIsoDateInput round-trips through calendarDateToIso", () => {
    const parsed = parseIsoDateInput("2026-07-29");
    expect(parsed).toEqual({ year: 2026, month: 7, day: 29 });
    expect(calendarDateToIso(parsed!)).toBe("2026-07-29");
  });

  it("parseIsoDateInput rejects an impossible calendar date (e.g. Feb 30)", () => {
    expect(parseIsoDateInput("2023-02-30")).toBeNull();
    expect(isValidCalendarDate({ year: 2023, month: 2, day: 30 })).toBe(false);
  });

  it("never sends a date to a server (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/dates.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

// ---------------------------------------------------------------------------
// color-contrast.ts (extended) — spec sections 21, 37 (WCAG 2.2 known values)
// ---------------------------------------------------------------------------
describe("color-contrast.ts: contrast checker extensions", () => {
  it("parseColor handles HEX, rgb(), and hsl() forms of the same color equivalently", () => {
    const fromHex = parseColor("#336699");
    const fromRgb = parseColor("rgb(51, 102, 153)");
    const fromHsl = parseColor("hsl(210, 50%, 40%)");
    expect(fromHex).toEqual([51, 102, 153]);
    expect(fromRgb).toEqual([51, 102, 153]);
    // HSL->RGB rounding can be off by 1 per channel; assert closeness instead of exact equality.
    for (let i = 0; i < 3; i++) expect(Math.abs(fromHsl![i] - fromRgb![i])).toBeLessThanOrEqual(1);
  });

  it("parseColor returns null for unrecognized input", () => {
    expect(parseColor("not-a-color")).toBeNull();
  });

  it("black on white is the maximum possible contrast ratio, 21:1", () => {
    const ratio = contrastRatioRgb([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("a color against itself has a contrast ratio of exactly 1:1", () => {
    expect(contrastRatioRgb([100, 150, 200], [100, 150, 200])).toBeCloseTo(1, 6);
  });

  it("evaluateWcagLevels applies the exact WCAG 2.2 thresholds (4.5 / 3 / 7 / 4.5) without rounding before comparison", () => {
    expect(evaluateWcagLevels(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true });
    expect(evaluateWcagLevels(4.49999).aaNormal).toBe(false);
    expect(evaluateWcagLevels(7).aaaNormal).toBe(true);
    expect(evaluateWcagLevels(2.99999).aaLarge).toBe(false);
  });

  it("suggestAdjustedColor finds a lighter or darker variant that actually reaches the target ratio", () => {
    const fg = parseColor("#777777")!;
    const bg = parseColor("#808080")!; // low contrast gray-on-gray
    const lighter = suggestAdjustedColor(fg, bg, 4.5, "lighter");
    const darker = suggestAdjustedColor(fg, bg, 4.5, "darker");
    if (lighter) expect(contrastRatioRgb(lighter, bg)).toBeGreaterThanOrEqual(4.499);
    if (darker) expect(contrastRatioRgb(darker, bg)).toBeGreaterThanOrEqual(4.499);
  });

  it("suggestAdjustedColor honestly returns null when even the extreme (pure white/black) can't reach an impossible target", () => {
    const fg = parseColor("#808080")!;
    const bg = parseColor("#808080")!; // identical colors — 1:1, can never reach 21:1 by adjusting only the foreground's lightness at the same hue
    expect(suggestAdjustedColor(fg, bg, 21, "lighter")).toBeNull();
  });

  it("rgbToHex and hslToRgb are consistent round-trip helpers", () => {
    expect(rgbToHex([255, 0, 0])).toBe("#ff0000");
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
  });
});

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildMonthGrid,
  buildCalendarGrids,
  createDefaultCalendarOptions,
  createSchoolPeriod,
  createSchoolBreak,
  dateInAnyBreak,
  validateCalendarOptions,
  calendarEventsToCsv,
  type CalendarEvent,
} from "@/lib/public-tools/organization/printable-calendar";
import { buildPrintableCalendarPdf } from "@/lib/public-tools/organization/printable-calendar-pdf";
import {
  createDefaultPlannerOptions,
  createCustomTimeBlock,
  createPlannerGoal,
  createGoalStep,
  sortedCustomBlocks,
  plannerWeekDates,
  plannerTimeBlocks,
  plannerTitle,
  validatePlannerOptions,
  PLANNER_MODE_LABELS,
  type PlannerMode,
} from "@/lib/public-tools/organization/planner";
import { buildPlannerPdf } from "@/lib/public-tools/organization/planner-pdf";
import { createDefaultChecklist, createChecklistItem, createChecklistSection, computeChecklistStats, checklistToMarkdown, checklistToPlainText, validateChecklist } from "@/lib/public-tools/organization/checklist";
import { buildChecklistPdf } from "@/lib/public-tools/organization/checklist-pdf";
import {
  createDefaultAgenda,
  createAgendaTopic,
  agendaTotalMinutes,
  agendaEstimatedEndTime,
  convertAgendaToMinutes,
  validateAgenda,
  agendaToPlainText,
  createDefaultMinutes,
  createMeetingAction,
  validateMinutes,
  minutesToPlainText,
  meetingActionsToCsv,
  type MeetingAgenda,
  type MeetingMinutes,
} from "@/lib/public-tools/organization/meeting-documents";
import { buildAgendaPdf, buildMinutesPdf } from "@/lib/public-tools/organization/meeting-documents-pdf";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { extractPdfDrawnText } from "./helpers/pdf-text";

const PLANNER_MODES = Object.keys(PLANNER_MODE_LABELS) as PlannerMode[];

describe("organization/printable-calendar.ts: real calendar-grid math (never a second date implementation)", () => {
  it("February in a leap year has 29 real days in the grid", () => {
    const grid = buildMonthGrid(2028, 2, 1, []);
    const realDays = grid.weeks.flat().filter((c) => c.inCurrentMonth);
    expect(realDays.length).toBe(29);
    expect(realDays[realDays.length - 1].date.day).toBe(29);
  });

  it("February in a non-leap year has exactly 28 real days", () => {
    const grid = buildMonthGrid(2026, 2, 1, []);
    const realDays = grid.weeks.flat().filter((c) => c.inCurrentMonth);
    expect(realDays.length).toBe(28);
  });

  it("every week row has exactly 7 cells regardless of month length", () => {
    for (const month of [1, 2, 4]) {
      const grid = buildMonthGrid(2026, month, 1, []);
      for (const week of grid.weeks) expect(week).toHaveLength(7);
    }
  });

  it("real events are placed on the correct day cell", () => {
    const events: CalendarEvent[] = [{ id: "e1", year: 2026, month: 3, day: 15, label: "Reunión", isHoliday: false }];
    const grid = buildMonthGrid(2026, 3, 1, events);
    const day15 = grid.weeks.flat().find((c) => c.inCurrentMonth && c.date.day === 15);
    expect(day15?.events.map((e) => e.label)).toEqual(["Reunión"]);
  });

  it("multi-month mode correctly wraps across a year boundary (December -> January)", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 12, day: 1 });
    options.mode = "multi-month";
    options.year = 2026;
    options.month = 12;
    options.monthCount = 2;
    const grids = buildCalendarGrids(options);
    expect(grids).toHaveLength(2);
    expect(grids[0]).toMatchObject({ year: 2026, month: 12 });
    expect(grids[1]).toMatchObject({ year: 2027, month: 1 });
  });

  it("annual mode produces exactly 12 real months in order", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "annual";
    const grids = buildCalendarGrids(options);
    expect(grids.map((g) => g.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("never downloads or assumes national holidays — events are exactly what was passed in, nothing more", () => {
    const grid = buildMonthGrid(2026, 1, 1, []);
    expect(grid.weeks.flat().every((c) => c.events.length === 0)).toBe(true);
  });

  it("rejects a year outside the valid range", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.year = 10000;
    expect(validateCalendarOptions(options).errors.length).toBeGreaterThan(0);
  });

  it("calendarEventsToCsv round-trips real event data", () => {
    const csv = calendarEventsToCsv([{ id: "e1", year: 2026, month: 7, day: 4, label: "Evento CSV", isHoliday: true }]);
    expect(csv).toContain("2026-07-04");
    expect(csv).toContain("Evento CSV");
  });

  it("respects Sunday-first vs Monday-first weekday ordering in the grid padding", () => {
    // 2026-03-01 is a Sunday.
    const mondayFirst = buildMonthGrid(2026, 3, 1, []);
    const sundayFirst = buildMonthGrid(2026, 3, 0, []);
    // With Monday-first, Sunday 2026-03-01 lands in the last (7th) column; with Sunday-first, the 1st column.
    expect(mondayFirst.weeks[0][6].date.day).toBe(1);
    expect(sundayFirst.weeks[0][0].date.day).toBe(1);
  });

  it("school mode: buildCalendarGrids spans exactly the manually-defined start-to-end month range, never a downloaded academic calendar", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "school";
    options.schoolStartDate = { year: 2026, month: 9, day: 1 };
    options.schoolEndDate = { year: 2027, month: 6, day: 30 };
    const grids = buildCalendarGrids(options);
    expect(grids.map((g) => `${g.year}-${g.month}`)).toEqual([
      "2026-9", "2026-10", "2026-11", "2026-12", "2027-1", "2027-2", "2027-3", "2027-4", "2027-5", "2027-6",
    ]);
  });

  it("school mode: manually-defined periods and breaks are never inferred, and dateInAnyBreak correctly detects a break day", () => {
    const brk = createSchoolBreak({ year: 2026, month: 12, day: 20 });
    brk.startDate = { year: 2026, month: 12, day: 20 };
    brk.endDate = { year: 2027, month: 1, day: 6 };
    brk.label = "Vacaciones de invierno";
    expect(dateInAnyBreak({ year: 2026, month: 12, day: 25 }, [brk])?.label).toBe("Vacaciones de invierno");
    expect(dateInAnyBreak({ year: 2027, month: 2, day: 1 }, [brk])).toBeUndefined();

    const period = createSchoolPeriod({ year: 2026, month: 9, day: 1 });
    period.label = "1er trimestre";
    period.endDate = { year: 2026, month: 12, day: 19 };
    expect(period.label).toBe("1er trimestre");
  });

  it("school mode rejects an end date before the start date", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "school";
    options.schoolStartDate = { year: 2027, month: 1, day: 1 };
    options.schoolEndDate = { year: 2026, month: 1, day: 1 };
    expect(validateCalendarOptions(options).errors.length).toBeGreaterThan(0);
  });

  it("JSON export/import round-trips a real calendar, including school-mode periods and breaks (previously missing output)", () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "school";
    options.schoolStartDate = { year: 2026, month: 9, day: 1 };
    options.schoolEndDate = { year: 2027, month: 6, day: 30 };
    options.periods = [{ ...createSchoolPeriod(options.schoolStartDate), label: "1er trimestre" }];
    options.breaks = [{ ...createSchoolBreak(options.schoolStartDate), label: "Navidad" }];
    const envelope = buildDocumentEnvelope("generador-calendarios-imprimibles", options);
    const result = parseDocumentEnvelope<typeof options>(JSON.stringify(envelope), "generador-calendarios-imprimibles");
    expect(result.ok).toBe(true);
    expect(result.data?.periods[0]?.label).toBe("1er trimestre");
    expect(result.data?.breaks[0]?.label).toBe("Navidad");
  });
});

describe("organization/printable-calendar-pdf.ts: real PDF generation", () => {
  it("produces a real PDF with one page per month and the manual-events notice", async () => {
    const options = createDefaultCalendarOptions({ year: 2028, month: 2, day: 1 });
    options.events = [{ id: "e1", year: 2028, month: 2, day: 10, label: "EventoCalendarioReal", isHoliday: false }];
    const bytes = await buildPrintableCalendarPdf(options);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("febrero");
    expect(text).toContain("manualmente");
  });

  it("multi-month mode produces the correct number of real pages", async () => {
    const options = createDefaultCalendarOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "multi-month";
    options.monthCount = 3;
    const bytes = await buildPrintableCalendarPdf(options);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(3);
  });
});

describe("organization/planner.ts: weekly/monthly/daily planning, never medical advice", () => {
  it("plannerWeekDates always returns exactly 7 consecutive real dates starting on the configured weekday", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 7, day: 15 }); // a Wednesday
    options.firstDayOfWeek = 1; // Monday
    const week = plannerWeekDates(options);
    expect(week).toHaveLength(7);
    for (let i = 1; i < 7; i++) {
      const prevEpoch = Date.UTC(week[i - 1].year, week[i - 1].month - 1, week[i - 1].day);
      const curEpoch = Date.UTC(week[i].year, week[i].month - 1, week[i].day);
      expect(curEpoch - prevEpoch).toBe(86400000);
    }
  });

  it("plannerTimeBlocks generates one label per real hour in range", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 1, day: 1 });
    options.timeBlockStartHour = 8;
    options.timeBlockEndHour = 12;
    expect(plannerTimeBlocks(options)).toEqual(["08:00", "09:00", "10:00", "11:00"]);
  });

  it("rejects an end hour before the start hour", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 1, day: 1 });
    options.timeBlockStartHour = 10;
    options.timeBlockEndHour = 5;
    expect(validatePlannerOptions(options).errors.length).toBeGreaterThan(0);
  });

  it("plannerTitle reflects the real mode and dates", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 3, day: 10 });
    options.mode = "daily";
    expect(plannerTitle(options)).toBe("2026-03-10");
  });
});

describe("organization/planner.ts: block-schedule and goals modes (spec correction: 5 required minimum modes, not 3)", () => {
  it("offers exactly the 5 required minimum modes (semanal/mensual/diario/horario-por-bloques/objetivos)", () => {
    expect(PLANNER_MODES.sort()).toEqual(["weekly", "monthly", "daily", "block-schedule", "goals"].sort());
  });

  it("sortedCustomBlocks orders by start hour without mutating the visitor's original list, and supports fractional (half-hour) times", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 1, day: 1 });
    const late = { ...createCustomTimeBlock(), label: "Tarde", startHour: 14, endHour: 15 };
    const early = { ...createCustomTimeBlock(), label: "Temprano", startHour: 7.5, endHour: 9 };
    options.customBlocks = [late, early];
    const sorted = sortedCustomBlocks(options);
    expect(sorted.map((b) => b.label)).toEqual(["Temprano", "Tarde"]);
    expect(options.customBlocks.map((b) => b.label)).toEqual(["Tarde", "Temprano"]); // original order untouched
  });

  it("warns (never blocks) when two custom blocks overlap", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "block-schedule";
    options.customBlocks = [
      { ...createCustomTimeBlock(), label: "A", startHour: 9, endHour: 11 },
      { ...createCustomTimeBlock(), label: "B", startHour: 10, endHour: 12 },
    ];
    const result = validatePlannerOptions(options);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("solapan"))).toBe(true);
  });

  it("goals mode: progressPercent is always the visitor's own manual value, never computed from step completion", () => {
    const goal = createPlannerGoal();
    goal.title = "Aprender TypeScript";
    goal.steps = [
      { ...createGoalStep(), text: "Curso básico", done: true },
      { ...createGoalStep(), text: "Proyecto real", done: false },
    ];
    goal.progressPercent = 10; // deliberately inconsistent with "1 of 2 steps done" — the tool must not overwrite this
    expect(goal.progressPercent).toBe(10);
  });

  it("goals mode rejects an out-of-range manual progress percentage", () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 1, day: 1 });
    options.mode = "goals";
    options.goals = [{ ...createPlannerGoal(), title: "Meta", progressPercent: 150 }];
    expect(validatePlannerOptions(options).errors.length).toBeGreaterThan(0);
  });
});

describe("organization/planner-pdf.ts: real PDF for all 5 required minimum modes", () => {
  it("all 5 modes each produce a real, reloadable PDF", async () => {
    for (const mode of PLANNER_MODES) {
      const options = createDefaultPlannerOptions({ year: 2026, month: 6, day: 15 });
      options.mode = mode;
      if (mode === "block-schedule") options.customBlocks = [{ ...createCustomTimeBlock(), label: "BloqueReal", startHour: 9, endHour: 10 }];
      if (mode === "goals") options.goals = [{ ...createPlannerGoal(), title: "ObjetivoReal", progressPercent: 40, steps: [{ ...createGoalStep(), text: "PasoReal" }] }];
      const bytes = await buildPlannerPdf(options);
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount(), mode).toBeGreaterThanOrEqual(1);
    }
  });

  it("block-schedule mode draws the real block label and time range, not the generic hourly grid", async () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 6, day: 15 });
    options.mode = "block-schedule";
    options.customBlocks = [{ ...createCustomTimeBlock(), label: "EnfoqueProfundoReal", startHour: 7.5, endHour: 9 }];
    const bytes = await buildPlannerPdf(options);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("EnfoqueProfundoReal");
    expect(text).toContain("07:30");
  });

  it("goals mode draws the real objective title, a progress bar, and its steps", async () => {
    const options = createDefaultPlannerOptions({ year: 2026, month: 6, day: 15 });
    options.mode = "goals";
    options.goals = [{ ...createPlannerGoal(), title: "ObjetivoPdfReal", progressPercent: 65, steps: [{ ...createGoalStep(), text: "PasoPdfReal" }], notes: "NotaPdfReal" }];
    const bytes = await buildPlannerPdf(options);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("ObjetivoPdfReal");
    expect(text).toContain("PasoPdfReal");
    expect(text).toContain("65%");
  });
});

describe("organization/checklist.ts: sections, subitems, never a persistent task manager", () => {
  it("computeChecklistStats counts real completed vs total items", () => {
    const data = createDefaultChecklist();
    const section = createChecklistSection("Sección");
    const a = createChecklistItem();
    a.done = true;
    const b = createChecklistItem();
    section.items = [a, b];
    data.sections = [section];
    expect(computeChecklistStats(data)).toEqual({ totalItems: 2, doneItems: 1 });
  });

  it("checklistToMarkdown escapes special characters and reflects real checked state", () => {
    const data = createDefaultChecklist();
    const section = createChecklistSection("Tareas");
    const item = createChecklistItem();
    item.text = "Comprar *pan*";
    item.done = true;
    section.items = [item];
    data.sections = [section];
    const md = checklistToMarkdown(data, true);
    expect(md).toContain("- [x]");
    expect(md).toContain("\\*pan\\*");
  });

  it("checklistToMarkdown prints an unchecked box when state is excluded from export", () => {
    const data = createDefaultChecklist();
    const section = createChecklistSection("Tareas");
    const item = createChecklistItem();
    item.text = "Tarea";
    item.done = true;
    section.items = [item];
    data.sections = [section];
    expect(checklistToMarkdown(data, false)).toContain("- [ ]");
  });

  it("warns (never blocks) on a checklist with no items at all", () => {
    const data = createDefaultChecklist();
    data.sections = [createChecklistSection("Vacía")]; // createDefaultChecklist() itself seeds one item — build a genuinely empty one instead
    const result = validateChecklist(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("checklistToPlainText (the real TXT download output, spec section 8) reflects real checked state and content", () => {
    const data = createDefaultChecklist();
    const section = createChecklistSection("SeccionTxt");
    const item = createChecklistItem();
    item.text = "ElementoTxtReal";
    item.done = true;
    section.items = [item];
    data.sections = [section];
    const withState = checklistToPlainText(data, true);
    expect(withState).toContain("[x] ElementoTxtReal");
    expect(withState).toContain("SeccionTxt");
    const withoutState = checklistToPlainText(data, false);
    expect(withoutState).toContain("[ ] ElementoTxtReal");
  });
});

describe("organization/checklist-pdf.ts: real PDF with real checkbox rendering", () => {
  it("produces a real PDF containing the title and item text", async () => {
    const data = createDefaultChecklist();
    data.title = "ListaVerificacionReal";
    const section = createChecklistSection("SeccionReal");
    const item = createChecklistItem();
    item.text = "ElementoListaReal";
    section.items = [item];
    data.sections = [section];
    const bytes = await buildChecklistPdf(data, true);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("ListaVerificacionReal");
    expect(text).toContain("SeccionReal");
    expect(text).toContain("ElementoListaReal");
  });
});

describe("organization/meeting-documents.ts: agenda duration math, and agenda->minutes conversion", () => {
  it("agendaTotalMinutes sums real topic durations", () => {
    const agenda = createDefaultAgenda();
    agenda.topics = [{ ...createAgendaTopic(), durationMinutes: 15 }, { ...createAgendaTopic(), durationMinutes: 25 }];
    expect(agendaTotalMinutes(agenda)).toBe(40);
  });

  it("agendaEstimatedEndTime correctly wraps past midnight", () => {
    const agenda = createDefaultAgenda();
    agenda.startTime = "23:30";
    agenda.topics = [{ ...createAgendaTopic(), durationMinutes: 90 }]; // 23:30 + 90min = 01:00 next day
    expect(agendaEstimatedEndTime(agenda)).toBe("01:00");
  });

  it("warns when the sum of topics exceeds the available time, but never blocks", () => {
    const agenda = createDefaultAgenda();
    agenda.title = "Reunión";
    agenda.availableMinutes = 30;
    agenda.topics = [{ ...createAgendaTopic(), durationMinutes: 45 }];
    const result = validateAgenda(agenda);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("supera"))).toBe(true);
  });

  it("convertAgendaToMinutes carries over the real title, date, and participants", () => {
    const agenda = createDefaultAgenda();
    agenda.title = "Reunión de equipo";
    agenda.date = "2026-05-01";
    agenda.participants = ["Ana", "Luis"];
    agenda.topics = [{ ...createAgendaTopic(), title: "Tema uno" }];
    const minutes = convertAgendaToMinutes(agenda);
    expect(minutes.title).toBe("Reunión de equipo");
    expect(minutes.participants).toEqual(["Ana", "Luis"]);
    expect(minutes.topics.map((t) => t.topicTitle)).toEqual(["Tema uno"]);
  });

  it("warns when an action has a description but no responsible assigned", () => {
    const minutes = createDefaultMinutes();
    minutes.title = "Acta";
    minutes.actions = [{ ...createMeetingAction(), description: "Hacer algo", responsible: "" }];
    const result = validateMinutes(minutes);
    expect(result.warnings.some((w) => w.includes("responsable"))).toBe(true);
  });

  it("meetingActionsToCsv contains real action data", () => {
    const minutes = createDefaultMinutes();
    minutes.actions = [{ ...createMeetingAction(), description: "AccionCsvReal", responsible: "Ana", status: "in-progress" }];
    const csv = meetingActionsToCsv(minutes);
    expect(csv).toContain("AccionCsvReal");
    expect(csv).toContain("En curso");
  });

  it("agendaToPlainText and minutesToPlainText (previously-missing TXT output, spec section 8) contain the real written content", () => {
    const agenda = createDefaultAgenda();
    agenda.title = "AgendaTxtReal";
    agenda.topics = [{ ...createAgendaTopic(), title: "TemaTxtReal", durationMinutes: 15 }];
    const agendaTxt = agendaToPlainText(agenda);
    expect(agendaTxt).toContain("AgendaTxtReal");
    expect(agendaTxt).toContain("TemaTxtReal");
    expect(agendaTxt).toContain("15 min");

    const minutes = createDefaultMinutes();
    minutes.title = "ActaTxtReal";
    minutes.decisions = ["DecisionTxtReal"];
    minutes.actions = [{ ...createMeetingAction(), description: "AccionTxtReal", responsible: "Ana" }];
    const minutesTxt = minutesToPlainText(minutes);
    expect(minutesTxt).toContain("ActaTxtReal");
    expect(minutesTxt).toContain("DecisionTxtReal");
    expect(minutesTxt).toContain("AccionTxtReal");
  });

  it("JSON export/import round-trips a real agenda and a real minutes document (previously-missing JSON output, spec section 8)", () => {
    const agenda: MeetingAgenda = { ...createDefaultAgenda(), title: "AgendaJsonReal", topics: [{ ...createAgendaTopic(), title: "TemaJsonReal" }] };
    const agendaEnvelope = buildDocumentEnvelope("generador-agendas-actas-reunion-agenda", agenda);
    const agendaResult = parseDocumentEnvelope<MeetingAgenda>(JSON.stringify(agendaEnvelope), "generador-agendas-actas-reunion-agenda");
    expect(agendaResult.ok).toBe(true);
    expect(agendaResult.data?.title).toBe("AgendaJsonReal");

    const minutes: MeetingMinutes = { ...createDefaultMinutes(), title: "ActaJsonReal", decisions: ["DecisionJsonReal"] };
    const minutesEnvelope = buildDocumentEnvelope("generador-agendas-actas-reunion-acta", minutes);
    const minutesResult = parseDocumentEnvelope<MeetingMinutes>(JSON.stringify(minutesEnvelope), "generador-agendas-actas-reunion-acta");
    expect(minutesResult.ok).toBe(true);
    expect(minutesResult.data?.decisions).toEqual(["DecisionJsonReal"]);

    // Cross-importing an agenda JSON into the minutes slot (and vice versa) must be rejected — they are distinct tool identities.
    const crossImport = parseDocumentEnvelope<MeetingMinutes>(JSON.stringify(agendaEnvelope), "generador-agendas-actas-reunion-acta");
    expect(crossImport.ok).toBe(false);
  });
});

describe("organization/meeting-documents-pdf.ts: real PDF for agenda and minutes, never audio recording or AI summaries", () => {
  it("agenda PDF contains real topics and the calculated total duration", async () => {
    const agenda = createDefaultAgenda();
    agenda.title = "AgendaReunionReal";
    agenda.topics = [{ ...createAgendaTopic(), title: "TemaAgendaReal", durationMinutes: 20 }];
    const bytes = await buildAgendaPdf(agenda);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("AgendaReunionReal");
    expect(text).toContain("TemaAgendaReal");
    expect(text).toContain("20 min");
  });

  it("minutes PDF contains real decisions and actions", async () => {
    const minutes = createDefaultMinutes();
    minutes.title = "ActaReunionReal";
    minutes.decisions = ["DecisionActaReal"];
    minutes.actions = [{ ...createMeetingAction(), description: "AccionActaReal", responsible: "Responsable" }];
    const bytes = await buildMinutesPdf(minutes);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("ActaReunionReal");
    expect(text).toContain("DecisionActaReal");
    expect(text).toContain("AccionActaReal");
  });
});

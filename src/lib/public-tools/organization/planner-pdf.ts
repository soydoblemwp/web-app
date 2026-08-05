import { createPdfKit, drawTextAt, drawRect, ensureSpace, drawParagraph, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { calendarDateToIso, weekdayOf } from "@/lib/public-tools/utilities/dates";
import { buildMonthGrid } from "./printable-calendar";
import { PLANNER_SECTION_LABELS, plannerTimeBlocks, plannerTitle, plannerWeekDates, sortedCustomBlocks, formatCustomBlockRange, type PlannerOptions } from "./planner";

const WEEKDAY_SHORT_ES: Record<string, string> = { domingo: "Dom", lunes: "Lun", martes: "Mar", miércoles: "Mié", jueves: "Jue", viernes: "Vie", sábado: "Sáb" };

export async function buildPlannerPdf(options: PlannerOptions): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 36);
  drawTextAt(ctx, plannerTitle(options), ctx.pageWidth / 2, ctx.pageHeight - ctx.margin - 6, { size: 18, font: ctx.bold, align: "center" });

  const enabledSections = options.sections.filter((s) => s.enabled);
  const contentTop = ctx.pageHeight - ctx.margin - 40;
  const contentBottom = ctx.margin;
  const contentWidth = ctx.pageWidth - ctx.margin * 2;

  // The two new modes (block-schedule, goals) use entirely separate data models and layouts —
  // never the generic weekly/monthly/daily time-block grid below.
  if (options.mode === "block-schedule") {
    const blocks = sortedCustomBlocks(options);
    let y = contentTop;
    const rowHeight = Math.min(50, (contentTop - contentBottom) / Math.max(1, blocks.length));
    for (const block of blocks) {
      ensureSpace(ctx, rowHeight);
      drawRect(ctx, ctx.margin, y - rowHeight + 4, contentWidth, rowHeight - 6, { borderColor: [0.82, 0.82, 0.82], borderWidth: 0.75 });
      drawTextAt(ctx, formatCustomBlockRange(block), ctx.margin + 8, y - 16, { size: 9, color: [0.4, 0.4, 0.4] });
      drawTextAt(ctx, block.label || "(sin nombre)", ctx.margin + 8, y - 32, { size: 11, font: ctx.bold });
      y -= rowHeight;
    }
    return finalizePdf(ctx);
  }

  if (options.mode === "goals") {
    let y = contentTop;
    for (const goal of options.goals) {
      ensureSpace(ctx, 60);
      drawTextAt(ctx, goal.title || "(sin título)", ctx.margin, y, { size: 13, font: ctx.bold });
      const meta = [goal.targetDate, goal.priority ? `Prioridad: ${goal.priority}` : ""].filter(Boolean).join("   ·   ");
      if (meta) drawTextAt(ctx, meta, ctx.pageWidth - ctx.margin, y, { size: 8.5, color: [0.4, 0.4, 0.4], align: "right" });
      y -= 14;
      const barWidth = contentWidth;
      drawRect(ctx, ctx.margin, y - 8, barWidth, 8, { borderColor: [0.8, 0.8, 0.8], borderWidth: 0.5 });
      drawRect(ctx, ctx.margin, y - 8, (barWidth * Math.max(0, Math.min(100, goal.progressPercent))) / 100, 8, { color: [0.15, 0.39, 0.92] });
      drawTextAt(ctx, `${goal.progressPercent}%`, ctx.margin + barWidth + 4, y - 7, { size: 7.5, color: [0.4, 0.4, 0.4] });
      y -= 20;
      for (const step of goal.steps) {
        ensureSpace(ctx, 12);
        drawRect(ctx, ctx.margin, y - 8, 8, 8, { color: step.done ? [0.2, 0.2, 0.2] : undefined, borderColor: [0.3, 0.3, 0.3], borderWidth: 0.75 });
        drawTextAt(ctx, step.text || "(paso)", ctx.margin + 14, y - 6, { size: 9 });
        y -= 13;
      }
      if (goal.notes) {
        y -= 2;
        drawParagraph(ctx, goal.notes, { size: 8.5, color: [0.4, 0.4, 0.4], x: ctx.margin, maxWidth: contentWidth });
        y = ctx.y;
      }
      y -= 14;
      ctx.y = y;
    }
    return finalizePdf(ctx);
  }

  const gridHeight = options.useTimeBlocks ? (contentTop - contentBottom) * (enabledSections.length > 0 ? 0.62 : 1) : 0;

  if (options.mode === "weekly") {
    const days = plannerWeekDates(options);
    const blocks = plannerTimeBlocks(options);
    const timeColWidth = 42;
    const dayColWidth = (contentWidth - timeColWidth) / 7;
    if (options.useTimeBlocks && blocks.length > 0) {
      for (let i = 0; i < days.length; i++) {
        const x = ctx.margin + timeColWidth + i * dayColWidth;
        drawTextAt(ctx, `${WEEKDAY_SHORT_ES[weekdayOf(days[i])] ?? ""} ${days[i].day}`, x + dayColWidth / 2, contentTop, { size: 8, font: ctx.bold, align: "center" });
      }
      const rowHeight = gridHeight / blocks.length;
      blocks.forEach((label, row) => {
        const rowTop = contentTop - 14 - row * rowHeight;
        drawTextAt(ctx, label, ctx.margin, rowTop - rowHeight / 2, { size: 6.5, color: [0.5, 0.5, 0.5] });
        for (let col = 0; col < 7; col++) {
          drawRect(ctx, ctx.margin + timeColWidth + col * dayColWidth, rowTop - rowHeight, dayColWidth, rowHeight, { borderColor: [0.88, 0.88, 0.88], borderWidth: 0.5 });
        }
      });
    }
  } else if (options.mode === "monthly") {
    const grid = buildMonthGrid(options.anchorDate.year, options.anchorDate.month, options.firstDayOfWeek, []);
    const dayColWidth = contentWidth / 7;
    const rowHeight = gridHeight / Math.max(1, grid.weeks.length);
    let rowTop = contentTop;
    for (const week of grid.weeks) {
      for (let col = 0; col < 7; col++) {
        const x = ctx.margin + col * dayColWidth;
        drawRect(ctx, x, rowTop - rowHeight, dayColWidth, rowHeight, { borderColor: [0.88, 0.88, 0.88], borderWidth: 0.5 });
        if (week[col].inCurrentMonth) drawTextAt(ctx, String(week[col].date.day), x + 4, rowTop - 12, { size: 8, font: ctx.bold });
      }
      rowTop -= rowHeight;
    }
  } else {
    // daily
    const blocks = plannerTimeBlocks(options);
    if (options.useTimeBlocks && blocks.length > 0) {
      const rowHeight = gridHeight / blocks.length;
      blocks.forEach((label, row) => {
        const rowTop = contentTop - row * rowHeight;
        drawTextAt(ctx, label, ctx.margin, rowTop - rowHeight / 2, { size: 8, color: [0.5, 0.5, 0.5] });
        drawRect(ctx, ctx.margin + 46, rowTop - rowHeight, contentWidth - 46, rowHeight, { borderColor: [0.88, 0.88, 0.88], borderWidth: 0.5 });
      });
    }
  }

  if (enabledSections.length > 0) {
    const sectionsTop = options.useTimeBlocks ? contentTop - gridHeight - 16 : contentTop;
    const colCount = Math.min(3, enabledSections.length);
    const colWidth = contentWidth / colCount;
    const boxHeight = sectionsTop - contentBottom - 4;
    enabledSections.forEach((section, i) => {
      const col = i % colCount;
      const x = ctx.margin + col * colWidth;
      const y = sectionsTop - Math.floor(i / colCount) * (boxHeight / Math.ceil(enabledSections.length / colCount));
      const h = boxHeight / Math.ceil(enabledSections.length / colCount) - 6;
      drawRect(ctx, x, y - h, colWidth - 6, h, { borderColor: [0.8, 0.8, 0.8], borderWidth: 0.75 });
      drawTextAt(ctx, PLANNER_SECTION_LABELS[section.kind], x + 5, y - 12, { size: 8.5, font: ctx.bold });
    });
  }

  return finalizePdf(ctx);
}

export function plannerDatesAsIso(options: PlannerOptions): string[] {
  return options.mode === "weekly" ? plannerWeekDates(options).map(calendarDateToIso) : [calendarDateToIso(options.anchorDate)];
}

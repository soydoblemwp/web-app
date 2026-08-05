import { createPdfKit, drawTextAt, drawRect, drawParagraph, ensureSpace, finalizePdf, type PdfKitContext } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { calendarDateToIso } from "@/lib/public-tools/utilities/dates";
import { buildCalendarGrids, isoWeekNumber, dateInAnyBreak, type CalendarOptions, type MonthGrid } from "./printable-calendar";

const WEEKDAY_LABELS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function orderedWeekdayLabels(firstDayOfWeek: 0 | 1): string[] {
  return [...WEEKDAY_LABELS_ES.slice(firstDayOfWeek), ...WEEKDAY_LABELS_ES.slice(0, firstDayOfWeek)];
}

function drawMonthPage(ctx: PdfKitContext, grid: MonthGrid, options: CalendarOptions): void {
  const contentWidth = ctx.pageWidth - ctx.margin * 2;
  drawTextAt(ctx, `${grid.monthName} ${grid.year}`, ctx.pageWidth / 2, ctx.pageHeight - ctx.margin - 6, { size: 20, font: ctx.bold, align: "center" });

  const gridTop = ctx.pageHeight - ctx.margin - 50;
  const weekNumberColWidth = options.showWeekNumbers ? 26 : 0;
  const dayColWidth = (contentWidth - weekNumberColWidth) / 7;
  const headerHeight = 20;
  const rowHeight = Math.min(80, (gridTop - ctx.margin) / (grid.weeks.length + 1));

  const labels = orderedWeekdayLabels(options.firstDayOfWeek);
  for (let col = 0; col < 7; col++) {
    const x = ctx.margin + weekNumberColWidth + col * dayColWidth;
    drawTextAt(ctx, labels[col], x + dayColWidth / 2, gridTop - 14, { size: 9, font: ctx.bold, align: "center", color: [0.4, 0.4, 0.4] });
  }

  let rowTop = gridTop - headerHeight;
  for (const week of grid.weeks) {
    if (options.showWeekNumbers) {
      const firstRealDay = week.find((cell) => cell.inCurrentMonth);
      if (firstRealDay) drawTextAt(ctx, String(isoWeekNumber(firstRealDay.date)), ctx.margin + weekNumberColWidth / 2, rowTop - rowHeight / 2, { size: 7, align: "center", color: [0.6, 0.6, 0.6] });
    }
    for (let col = 0; col < 7; col++) {
      const cell = week[col];
      const x = ctx.margin + weekNumberColWidth + col * dayColWidth;
      const isBreakDay = options.mode === "school" && cell.inCurrentMonth && dateInAnyBreak(cell.date, options.breaks) !== undefined;
      drawRect(ctx, x, rowTop - rowHeight, dayColWidth, rowHeight, {
        color: isBreakDay ? [0.93, 0.93, 0.97] : undefined,
        borderColor: [0.85, 0.85, 0.85],
        borderWidth: 0.5,
      });
      if (cell.inCurrentMonth) {
        drawTextAt(ctx, String(cell.date.day), x + 4, rowTop - 12, { size: 9, font: ctx.bold });
        let eventY = rowTop - 24;
        for (const event of cell.events.slice(0, 3)) {
          drawTextAt(ctx, event.label.slice(0, 20), x + 4, eventY, { size: 6.5, color: event.isHoliday ? [0.7, 0.15, 0.15] : [0.25, 0.25, 0.25] });
          eventY -= 8;
        }
      }
    }
    rowTop -= rowHeight;
  }

  drawTextAt(ctx, "Los festivos y eventos son los que introduzcas manualmente.", ctx.margin, ctx.margin - 4, { size: 7, color: [0.55, 0.55, 0.55] });
}

function drawSchoolSummaryPage(ctx: PdfKitContext, options: CalendarOptions): void {
  ctx.y = ctx.pageHeight - ctx.margin;
  drawTextAt(ctx, "Calendario escolar", ctx.pageWidth / 2, ctx.y - 6, { size: 20, font: ctx.bold, align: "center" });
  ctx.y -= 40;
  drawTextAt(ctx, `Del ${calendarDateToIso(options.schoolStartDate)} al ${calendarDateToIso(options.schoolEndDate)}`, ctx.pageWidth / 2, ctx.y, { size: 10, color: [0.4, 0.4, 0.4], align: "center" });
  ctx.y -= 30;

  ensureSpace(ctx, 20);
  drawTextAt(ctx, "Periodos", ctx.margin, ctx.y, { size: 13, font: ctx.bold });
  ctx.y -= 18;
  if (options.periods.length === 0) drawParagraph(ctx, "(sin periodos definidos)", { size: 9, color: [0.55, 0.55, 0.55] });
  for (const period of options.periods) {
    ensureSpace(ctx, 14);
    drawParagraph(ctx, `${period.label || "(sin nombre)"}: ${calendarDateToIso(period.startDate)} — ${calendarDateToIso(period.endDate)}`, { size: 9.5 });
  }
  ctx.y -= 16;

  ensureSpace(ctx, 20);
  drawTextAt(ctx, "Descansos", ctx.margin, ctx.y, { size: 13, font: ctx.bold });
  ctx.y -= 18;
  if (options.breaks.length === 0) drawParagraph(ctx, "(sin descansos definidos)", { size: 9, color: [0.55, 0.55, 0.55] });
  for (const brk of options.breaks) {
    ensureSpace(ctx, 14);
    drawParagraph(ctx, `${brk.label || "(sin nombre)"}: ${calendarDateToIso(brk.startDate)} — ${calendarDateToIso(brk.endDate)}`, { size: 9.5 });
  }

  drawTextAt(ctx, "Los periodos, descansos, eventos y festivos son los que introduzcas manualmente.", ctx.margin, ctx.margin - 4, { size: 7, color: [0.55, 0.55, 0.55] });
}

export async function buildPrintableCalendarPdf(options: CalendarOptions): Promise<Uint8Array> {
  const grids = buildCalendarGrids(options);
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 36);
  if (options.mode === "school") {
    drawSchoolSummaryPage(ctx, options);
  }
  grids.forEach((grid, index) => {
    if (index > 0 || options.mode === "school") ctx.page = ctx.doc.addPage(PAGE_SIZES_PT.LETTER);
    ctx.y = ctx.pageHeight - ctx.margin;
    drawMonthPage(ctx, grid, options);
  });
  return finalizePdf(ctx);
}

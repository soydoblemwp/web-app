import { rgb } from "pdf-lib";
import { createPdfKit, drawLine, drawParagraph, drawRect, ensureSpace, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import type { ChecklistData } from "./checklist";

export async function buildChecklistPdf(data: ChecklistData, includeState: boolean): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 44);

  if (data.title) drawLine(ctx, data.title, { size: 18, font: ctx.bold });
  if (data.description) drawParagraph(ctx, data.description, { size: 9.5, color: [0.4, 0.4, 0.4] });
  ctx.y -= 6;

  const boxSize = 9;
  for (const section of data.sections) {
    if (section.items.length === 0) continue;
    ensureSpace(ctx, 20);
    drawLine(ctx, section.title, { size: 12, font: ctx.bold });
    for (const item of section.items) {
      ensureSpace(ctx, 14);
      drawRect(ctx, ctx.margin, ctx.y - boxSize + 1, boxSize, boxSize, { color: includeState && item.done ? [0.2, 0.2, 0.2] : undefined, borderColor: [0.3, 0.3, 0.3], borderWidth: 0.75 });
      const meta = [data.showAssignee && item.assignee ? `· ${item.assignee}` : "", data.showDueDate && item.dueDate ? `· ${item.dueDate}` : ""].filter(Boolean).join(" ");
      ctx.page.drawText(`${item.text || "(sin texto)"} ${meta}`.trim(), { x: ctx.margin + boxSize + 6, y: ctx.y, size: 9.5, font: ctx.font });
      ctx.y -= 14;
      for (const sub of item.subItems) {
        ensureSpace(ctx, 12);
        drawRect(ctx, ctx.margin + 18, ctx.y - boxSize + 2, boxSize - 2, boxSize - 2, { color: includeState && sub.done ? [0.2, 0.2, 0.2] : undefined, borderColor: [0.4, 0.4, 0.4], borderWidth: 0.6 });
        ctx.page.drawText(sub.text || "(sin texto)", { x: ctx.margin + 18 + boxSize + 4, y: ctx.y, size: 8.5, font: ctx.font });
        ctx.y -= 12;
      }
    }
    ctx.y -= 8;
  }

  if (data.includeSignatureLine) {
    ensureSpace(ctx, 40);
    ctx.y -= 20;
    ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.margin + 200, y: ctx.y }, thickness: 0.75, color: rgb(0.5, 0.5, 0.5) });
    drawLine(ctx, "Firma", { size: 8, color: [0.5, 0.5, 0.5] });
  }

  return finalizePdf(ctx);
}

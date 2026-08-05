import { createPdfKit, drawLine, drawParagraph, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { coverLetterParagraphs, coverLetterSubjectLine, COVER_LETTER_MODE_CONFIG, type CoverLetterData } from "./cover-letter";

export async function buildCoverLetterPdf(data: CoverLetterData): Promise<Uint8Array> {
  const config = COVER_LETTER_MODE_CONFIG[data.mode];
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 54);

  if (data.candidateName) drawLine(ctx, data.candidateName, { size: 13, font: ctx.bold });
  for (const line of data.candidateContact.split("\n").filter(Boolean)) drawLine(ctx, line, { size: 9.5, color: [0.35, 0.35, 0.35] });
  ctx.y -= 10;

  if (data.date) {
    drawLine(ctx, data.date, { size: 10 });
    ctx.y -= 6;
  }

  if (config.showFullAddressBlock) {
    if (data.recipientName) drawLine(ctx, data.recipientName, { size: 10 });
    if (data.recipientTitle) drawLine(ctx, data.recipientTitle, { size: 10 });
    if (data.companyName) drawLine(ctx, data.companyName, { size: 10 });
    for (const line of data.companyAddress.split("\n").filter(Boolean)) drawLine(ctx, line, { size: 10 });
    ctx.y -= 10;
  } else if (data.recipientName || data.companyName) {
    drawLine(ctx, [data.recipientName, data.companyName].filter(Boolean).join(" · "), { size: 10, color: [0.35, 0.35, 0.35] });
    ctx.y -= 8;
  }

  const subject = coverLetterSubjectLine(data);
  if (subject) {
    drawParagraph(ctx, subject, { size: 10, font: ctx.bold });
    ctx.y -= 8;
  }

  if (data.salutation) {
    drawLine(ctx, data.salutation, { size: 10.5 });
    ctx.y -= 6;
  }

  for (const paragraph of coverLetterParagraphs(data)) {
    drawParagraph(ctx, paragraph, { size: 10.5, lineGap: 2 });
    ctx.y -= 10;
  }

  ctx.y -= 4;
  if (data.farewell) drawLine(ctx, data.farewell, { size: 10.5 });
  ctx.y -= 24;
  if (data.signatureName) drawLine(ctx, data.signatureName, { size: 10.5, font: ctx.bold });

  return finalizePdf(ctx);
}

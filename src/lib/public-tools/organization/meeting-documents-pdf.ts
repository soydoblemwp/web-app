import { createPdfKit, drawLine, drawParagraph, ensureSpace, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { agendaEstimatedEndTime, agendaTotalMinutes, type MeetingAgenda, type MeetingMinutes, type MeetingActionStatus } from "./meeting-documents";

const ACTION_STATUS_LABEL: Record<MeetingActionStatus, string> = { pending: "Pendiente", "in-progress": "En curso", done: "Completada" };

export async function buildAgendaPdf(agenda: MeetingAgenda): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 44);
  drawLine(ctx, agenda.title || "Agenda de reunión", { size: 18, font: ctx.bold });
  const meta = [agenda.date, agenda.startTime, agenda.location].filter(Boolean).join("   ·   ");
  if (meta) drawLine(ctx, meta, { size: 10, color: [0.4, 0.4, 0.4] });
  if (agenda.organizer) drawLine(ctx, `Organiza: ${agenda.organizer}`, { size: 9.5 });
  if (agenda.participants.length > 0) drawParagraph(ctx, `Participantes: ${agenda.participants.join(", ")}`, { size: 9.5 });
  if (agenda.objective) {
    ctx.y -= 4;
    drawLine(ctx, "Objetivo:", { size: 10.5, font: ctx.bold });
    drawParagraph(ctx, agenda.objective, { size: 9.5 });
  }

  ctx.y -= 8;
  drawLine(ctx, "Temas", { size: 12, font: ctx.bold });
  for (const [i, topic] of agenda.topics.entries()) {
    ensureSpace(ctx, 14);
    const line = `${i + 1}. ${topic.title || "(sin título)"} — ${topic.durationMinutes} min${topic.responsible ? ` (${topic.responsible})` : ""}`;
    drawParagraph(ctx, line, { size: 9.5 });
  }

  ctx.y -= 6;
  const total = agendaTotalMinutes(agenda);
  const endTime = agendaEstimatedEndTime(agenda);
  drawLine(ctx, `Duración total: ${total} min${endTime ? ` — hora estimada de finalización: ${endTime}` : ""}`, { size: 9.5, font: ctx.bold });
  if (agenda.availableMinutes !== null && total > agenda.availableMinutes) {
    drawParagraph(ctx, `Aviso: la suma de los temas supera el tiempo disponible (${agenda.availableMinutes} min).`, { size: 8.5, color: [0.7, 0.2, 0.1] });
  }

  if (agenda.materials) {
    ctx.y -= 6;
    drawLine(ctx, "Material previo:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, agenda.materials, { size: 9 });
  }
  if (agenda.notes) {
    ctx.y -= 4;
    drawLine(ctx, "Notas:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, agenda.notes, { size: 9 });
  }

  return finalizePdf(ctx);
}

export async function buildMinutesPdf(minutes: MeetingMinutes): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 44);
  drawLine(ctx, minutes.title || "Acta de reunión", { size: 18, font: ctx.bold });
  if (minutes.date) drawLine(ctx, minutes.date, { size: 10, color: [0.4, 0.4, 0.4] });
  if (minutes.participants.length > 0) drawParagraph(ctx, `Participantes: ${minutes.participants.join(", ")}`, { size: 9.5 });
  if (minutes.absent.length > 0) drawParagraph(ctx, `Ausentes: ${minutes.absent.join(", ")}`, { size: 9.5, color: [0.5, 0.5, 0.5] });

  if (minutes.topics.length > 0) {
    ctx.y -= 8;
    drawLine(ctx, "Temas tratados", { size: 12, font: ctx.bold });
    for (const topic of minutes.topics) {
      ensureSpace(ctx, 14);
      drawLine(ctx, topic.topicTitle || "(sin título)", { size: 10, font: ctx.bold });
      if (topic.summary) drawParagraph(ctx, topic.summary, { size: 9 });
    }
  }

  if (minutes.decisions.length > 0) {
    ctx.y -= 6;
    drawLine(ctx, "Decisiones", { size: 12, font: ctx.bold });
    for (const decision of minutes.decisions) drawParagraph(ctx, `• ${decision}`, { size: 9.5 });
  }

  if (minutes.actions.length > 0) {
    ctx.y -= 6;
    drawLine(ctx, "Acciones", { size: 12, font: ctx.bold });
    const colX = { desc: ctx.margin, responsible: 300, due: 400, status: 470 };
    ensureSpace(ctx, 14);
    ctx.page.drawText("Acción", { x: colX.desc, y: ctx.y, size: 8.5, font: ctx.bold });
    ctx.page.drawText("Responsable", { x: colX.responsible, y: ctx.y, size: 8.5, font: ctx.bold });
    ctx.page.drawText("Fecha", { x: colX.due, y: ctx.y, size: 8.5, font: ctx.bold });
    ctx.page.drawText("Estado", { x: colX.status, y: ctx.y, size: 8.5, font: ctx.bold });
    ctx.y -= 13;
    for (const action of minutes.actions) {
      ensureSpace(ctx, 13);
      ctx.page.drawText(action.description || "(sin descripción)", { x: colX.desc, y: ctx.y, size: 8.5, font: ctx.font });
      ctx.page.drawText(action.responsible, { x: colX.responsible, y: ctx.y, size: 8.5, font: ctx.font });
      ctx.page.drawText(action.dueDate, { x: colX.due, y: ctx.y, size: 8.5, font: ctx.font });
      ctx.page.drawText(ACTION_STATUS_LABEL[action.status], { x: colX.status, y: ctx.y, size: 8.5, font: ctx.font });
      ctx.y -= 13;
    }
  }

  if (minutes.nextMeetingDate) {
    ctx.y -= 8;
    drawLine(ctx, `Próxima reunión: ${minutes.nextMeetingDate}`, { size: 9.5, font: ctx.bold });
  }

  return finalizePdf(ctx);
}

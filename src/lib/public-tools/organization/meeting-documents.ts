import { buildCsv } from "@/lib/public-tools/csv-export";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

/**
 * A single tool with two closely related modes (spec section 26: "no crees
 * dos herramientas separadas"). Never records audio, transcribes, summarizes
 * via AI, sends invitations, or creates calendar events — every field here
 * is typed by the visitor.
 */
export type MeetingDocMode = "agenda" | "minutes";

export interface AgendaTopic {
  id: string;
  title: string;
  responsible: string;
  durationMinutes: number;
}

export interface MeetingAgenda {
  title: string;
  date: string;
  startTime: string; // "HH:MM"
  location: string;
  organizer: string;
  participants: string[];
  objective: string;
  topics: AgendaTopic[];
  materials: string;
  notes: string;
  availableMinutes: number | null;
}

export type MeetingActionStatus = "pending" | "in-progress" | "done";

export interface MeetingAction {
  id: string;
  description: string;
  responsible: string;
  dueDate: string;
  status: MeetingActionStatus;
}

export interface MeetingTopicSummary {
  id: string;
  topicTitle: string;
  summary: string;
}

export interface MeetingMinutes {
  title: string;
  date: string;
  participants: string[];
  absent: string[];
  topics: MeetingTopicSummary[];
  decisions: string[];
  actions: MeetingAction[];
  nextMeetingDate: string;
}

export function createAgendaTopic(): AgendaTopic {
  return { id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: "", responsible: "", durationMinutes: 10 };
}

export function createMeetingAction(): MeetingAction {
  return { id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, description: "", responsible: "", dueDate: "", status: "pending" };
}

export function createDefaultAgenda(): MeetingAgenda {
  return { title: "", date: "", startTime: "09:00", location: "", organizer: "", participants: [], objective: "", topics: [createAgendaTopic()], materials: "", notes: "", availableMinutes: null };
}

export function createDefaultMinutes(): MeetingMinutes {
  return { title: "", date: "", participants: [], absent: [], topics: [], decisions: [], actions: [createMeetingAction()], nextMeetingDate: "" };
}

export function convertAgendaToMinutes(agenda: MeetingAgenda): MeetingMinutes {
  return {
    title: agenda.title,
    date: agenda.date,
    participants: agenda.participants,
    absent: [],
    topics: agenda.topics.map((t) => ({ id: t.id, topicTitle: t.title, summary: "" })),
    decisions: [],
    actions: [createMeetingAction()],
    nextMeetingDate: "",
  };
}

export function agendaTotalMinutes(agenda: MeetingAgenda): number {
  return agenda.topics.reduce((sum, t) => sum + Math.max(0, t.durationMinutes), 0);
}

export function agendaEstimatedEndTime(agenda: MeetingAgenda): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(agenda.startTime.trim());
  if (!match) return null;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = (startMinutes + agendaTotalMinutes(agenda)) % (24 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}

export interface AgendaValidation {
  errors: string[];
  warnings: string[];
}

export function validateAgenda(agenda: MeetingAgenda): AgendaValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!agenda.title.trim()) errors.push("Falta el título de la reunión.");
  if (agenda.topics.length === 0) errors.push("La agenda no tiene ningún tema.");
  if (agenda.topics.length > DOCUMENT_LIMITS.meeting.maxTopics) errors.push(`Demasiados temas (máximo ${DOCUMENT_LIMITS.meeting.maxTopics}).`);
  if (agenda.participants.length > DOCUMENT_LIMITS.meeting.maxParticipants) errors.push(`Demasiados participantes (máximo ${DOCUMENT_LIMITS.meeting.maxParticipants}).`);
  const total = agendaTotalMinutes(agenda);
  if (agenda.availableMinutes !== null && total > agenda.availableMinutes) {
    warnings.push(`La suma de los temas (${total} min) supera el tiempo disponible (${agenda.availableMinutes} min).`);
  }
  return { errors, warnings };
}

export interface MinutesValidation {
  errors: string[];
  warnings: string[];
}

export function validateMinutes(minutes: MeetingMinutes): MinutesValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!minutes.title.trim()) errors.push("Falta el título de la reunión.");
  if (minutes.actions.length > DOCUMENT_LIMITS.meeting.maxActions) errors.push(`Demasiadas acciones (máximo ${DOCUMENT_LIMITS.meeting.maxActions}).`);
  for (const action of minutes.actions) {
    if (action.description.trim() && !action.responsible.trim()) warnings.push(`La acción "${action.description}" no tiene responsable asignado.`);
  }
  return { errors, warnings };
}

export function meetingActionsToCsv(minutes: MeetingMinutes): string {
  const statusLabel: Record<MeetingActionStatus, string> = { pending: "Pendiente", "in-progress": "En curso", done: "Completada" };
  return buildCsv(
    ["Acción", "Responsable", "Fecha límite", "Estado"],
    minutes.actions.map((a) => [a.description, a.responsible, a.dueDate, statusLabel[a.status]])
  );
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+.!-])/g, "\\$1");
}

export function agendaToMarkdown(agenda: MeetingAgenda): string {
  const lines: string[] = [`# ${escapeMarkdown(agenda.title || "Agenda de reunión")}`, ""];
  const meta = [agenda.date, agenda.startTime, agenda.location].filter(Boolean).join(" · ");
  if (meta) lines.push(escapeMarkdown(meta), "");
  if (agenda.objective) lines.push(`**Objetivo:** ${escapeMarkdown(agenda.objective)}`, "");
  lines.push("## Temas", "");
  agenda.topics.forEach((t, i) => lines.push(`${i + 1}. ${escapeMarkdown(t.title || "(sin título)")} — ${t.durationMinutes} min${t.responsible ? ` (${escapeMarkdown(t.responsible)})` : ""}`));
  lines.push("", `**Duración total:** ${agendaTotalMinutes(agenda)} min`);
  return lines.join("\n") + "\n";
}

export function minutesToMarkdown(minutes: MeetingMinutes): string {
  const statusLabel: Record<MeetingActionStatus, string> = { pending: "Pendiente", "in-progress": "En curso", done: "Completada" };
  const lines: string[] = [`# ${escapeMarkdown(minutes.title || "Acta de reunión")}`, ""];
  if (minutes.date) lines.push(escapeMarkdown(minutes.date), "");
  if (minutes.decisions.length > 0) {
    lines.push("## Decisiones", "");
    for (const d of minutes.decisions) lines.push(`- ${escapeMarkdown(d)}`);
    lines.push("");
  }
  if (minutes.actions.length > 0) {
    lines.push("## Acciones", "");
    for (const a of minutes.actions) lines.push(`- [ ] ${escapeMarkdown(a.description)} — ${escapeMarkdown(a.responsible)} (${statusLabel[a.status]})`);
  }
  return lines.join("\n") + "\n";
}

export function agendaToPlainText(agenda: MeetingAgenda): string {
  const lines: string[] = [agenda.title || "Agenda de reunión", ""];
  const meta = [agenda.date, agenda.startTime, agenda.location].filter(Boolean).join(" · ");
  if (meta) lines.push(meta, "");
  if (agenda.organizer) lines.push(`Organiza: ${agenda.organizer}`);
  if (agenda.participants.length > 0) lines.push(`Participantes: ${agenda.participants.join(", ")}`);
  if (agenda.objective) lines.push("", `Objetivo: ${agenda.objective}`);
  lines.push("", "Temas:");
  agenda.topics.forEach((t, i) => lines.push(`${i + 1}. ${t.title || "(sin título)"} — ${t.durationMinutes} min${t.responsible ? ` (${t.responsible})` : ""}`));
  lines.push("", `Duración total: ${agendaTotalMinutes(agenda)} min`);
  if (agenda.materials) lines.push("", `Materiales: ${agenda.materials}`);
  if (agenda.notes) lines.push("", `Notas: ${agenda.notes}`);
  return lines.join("\n") + "\n";
}

export function minutesToPlainText(minutes: MeetingMinutes): string {
  const statusLabel: Record<MeetingActionStatus, string> = { pending: "Pendiente", "in-progress": "En curso", done: "Completada" };
  const lines: string[] = [minutes.title || "Acta de reunión", ""];
  if (minutes.date) lines.push(minutes.date, "");
  if (minutes.participants.length > 0) lines.push(`Participantes: ${minutes.participants.join(", ")}`);
  if (minutes.absent.length > 0) lines.push(`Ausentes: ${minutes.absent.join(", ")}`);
  if (minutes.topics.length > 0) {
    lines.push("", "Temas tratados:");
    for (const t of minutes.topics) lines.push(`- ${t.topicTitle || "(sin título)"}: ${t.summary}`);
  }
  if (minutes.decisions.length > 0) {
    lines.push("", "Decisiones:");
    for (const d of minutes.decisions) lines.push(`- ${d}`);
  }
  if (minutes.actions.length > 0) {
    lines.push("", "Acciones:");
    for (const a of minutes.actions) lines.push(`- ${a.description} — ${a.responsible} (${statusLabel[a.status]})${a.dueDate ? `, vence ${a.dueDate}` : ""}`);
  }
  if (minutes.nextMeetingDate) lines.push("", `Próxima reunión: ${minutes.nextMeetingDate}`);
  return lines.join("\n") + "\n";
}

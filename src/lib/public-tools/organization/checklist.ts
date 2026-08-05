import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

export interface ChecklistSubItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  priority: "" | "low" | "medium" | "high";
  assignee: string;
  dueDate: string;
  notes: string;
  subItems: ChecklistSubItem[];
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistData {
  title: string;
  description: string;
  sections: ChecklistSection[];
  showAssignee: boolean;
  showDueDate: boolean;
  includeSignatureLine: boolean;
}

export function createChecklistItem(): ChecklistItem {
  return { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: "", done: false, priority: "", assignee: "", dueDate: "", notes: "", subItems: [] };
}

export function createChecklistSection(title = "Sección"): ChecklistSection {
  return { id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, items: [] };
}

export function createDefaultChecklist(): ChecklistData {
  const section = createChecklistSection("Lista principal");
  section.items.push(createChecklistItem());
  return { title: "", description: "", sections: [section], showAssignee: false, showDueDate: false, includeSignatureLine: false };
}

export interface ChecklistStats {
  totalItems: number;
  doneItems: number;
}

export function computeChecklistStats(data: ChecklistData): ChecklistStats {
  let totalItems = 0;
  let doneItems = 0;
  for (const section of data.sections) {
    for (const item of section.items) {
      totalItems++;
      if (item.done) doneItems++;
    }
  }
  return { totalItems, doneItems };
}

export interface ChecklistValidation {
  errors: string[];
  warnings: string[];
}

export function validateChecklist(data: ChecklistData): ChecklistValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (data.sections.length > DOCUMENT_LIMITS.checklist.maxSections) errors.push(`Demasiadas secciones (máximo ${DOCUMENT_LIMITS.checklist.maxSections}).`);
  for (const section of data.sections) {
    if (section.items.length > DOCUMENT_LIMITS.checklist.maxItemsPerSection) errors.push(`La sección "${section.title}" tiene demasiados elementos.`);
    for (const item of section.items) {
      if (item.subItems.length > DOCUMENT_LIMITS.checklist.maxSubItemsPerItem) warnings.push(`Un elemento de "${section.title}" tiene demasiados subelementos.`);
    }
  }
  if (data.sections.every((s) => s.items.length === 0)) warnings.push("La lista no tiene ningún elemento todavía.");
  return { errors, warnings };
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+.!-])/g, "\\$1");
}

export function checklistToMarkdown(data: ChecklistData, includeState: boolean): string {
  const lines: string[] = [];
  if (data.title) lines.push(`# ${escapeMarkdown(data.title)}`, "");
  if (data.description) lines.push(escapeMarkdown(data.description), "");
  for (const section of data.sections) {
    lines.push(`## ${escapeMarkdown(section.title)}`, "");
    for (const item of section.items) {
      const box = includeState && item.done ? "[x]" : "[ ]";
      const meta = [data.showAssignee && item.assignee ? `@${item.assignee}` : "", data.showDueDate && item.dueDate ? `(${item.dueDate})` : ""].filter(Boolean).join(" ");
      lines.push(`- ${box} ${escapeMarkdown(item.text)}${meta ? ` ${meta}` : ""}`);
      for (const sub of item.subItems) {
        const subBox = includeState && sub.done ? "[x]" : "[ ]";
        lines.push(`  - ${subBox} ${escapeMarkdown(sub.text)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function checklistToPlainText(data: ChecklistData, includeState: boolean): string {
  const lines: string[] = [];
  if (data.title) lines.push(data.title.toUpperCase());
  if (data.description) lines.push(data.description);
  for (const section of data.sections) {
    lines.push("", section.title);
    for (const item of section.items) {
      lines.push(`${includeState && item.done ? "[x]" : "[ ]"} ${item.text}`);
      for (const sub of item.subItems) lines.push(`    ${includeState && sub.done ? "[x]" : "[ ]"} ${sub.text}`);
    }
  }
  return lines.join("\n");
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { parseCsv, serializeCsv } from "@/lib/performance/csv";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { publishAutomationEvent } from "@/server/services/automation-events";

/**
 * FAQ administration (Fase 40 spec section 9) - only PUBLISHED rows are ever
 * read by the widget/public endpoint (see customer-support-chat.ts). The
 * agent itself never calls anything in this file that writes a status
 * change - publication is always a human (MANAGER) action through the
 * server actions layer.
 */

export interface FaqFilter {
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category?: string;
  language?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function listFaqs(projectId: string, filter: FaqFilter = {}) {
  const limit = Math.min(filter.limit ?? 20, 100);
  const where: Record<string, unknown> = { projectId };
  if (filter.status) where.status = filter.status;
  if (filter.category) where.category = filter.category;
  if (filter.language) where.language = filter.language;
  if (filter.search) {
    where.OR = [{ question: { contains: filter.search, mode: "insensitive" } }, { answer: { contains: filter.search, mode: "insensitive" } }];
  }

  const rows = await prisma.customerSupportFaq.findMany({
    where: where as never,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { author: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true, email: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { faqs: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getFaq(projectId: string, faqId: string) {
  const faq = await prisma.customerSupportFaq.findUnique({ where: { id: faqId } });
  if (!faq || faq.projectId !== projectId) return null;
  return faq;
}

/** Only PUBLISHED, real answers the widget/public endpoint may ever read (spec section 9-10). */
export async function listPublishedFaqCandidates(projectId: string, language?: string) {
  return prisma.customerSupportFaq.findMany({
    where: { projectId, status: "PUBLISHED", ...(language ? { language } : {}) },
    orderBy: [{ priority: "desc" }],
    take: 500,
  });
}

export interface FaqInput {
  question: string;
  answer: string;
  category?: string | null;
  aliases?: string[];
  priority?: number;
  language?: string;
  relatedLink?: string | null;
}

export async function createFaq(projectId: string, userId: string, input: FaqInput) {
  const faq = await prisma.customerSupportFaq.create({
    data: {
      projectId,
      authorId: userId,
      question: input.question,
      answer: input.answer,
      category: input.category ?? null,
      aliases: input.aliases ?? [],
      priority: input.priority ?? 0,
      language: input.language ?? "es",
      relatedLink: input.relatedLink ?? null,
      status: "DRAFT",
    },
  });
  await logCustomerSupportAction(projectId, userId, "customer_support.faq_created", "CustomerSupportFaq", faq.id);
  return faq;
}

export async function updateFaq(projectId: string, userId: string, faqId: string, input: Partial<FaqInput>) {
  const faq = await getFaq(projectId, faqId);
  if (!faq) return { error: "FAQ no encontrada." };
  if (faq.status === "PUBLISHED") return { error: "Archiva esta FAQ antes de editarla, o crea una nueva version." };

  const updated = await prisma.customerSupportFaq.update({
    where: { id: faqId },
    data: {
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.answer !== undefined ? { answer: input.answer } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.relatedLink !== undefined ? { relatedLink: input.relatedLink } : {}),
    },
  });
  await logCustomerSupportAction(projectId, userId, "customer_support.faq_updated", "CustomerSupportFaq", faqId);
  return { faq: updated };
}

/** Human-only publication (spec section 9: "el agente no puede publicar FAQ") - the server action layer never lets this be called by anything except an authenticated MANAGER. */
export async function publishFaq(projectId: string, userId: string, faqId: string) {
  const faq = await getFaq(projectId, faqId);
  if (!faq) return { error: "FAQ no encontrada." };
  if (faq.status === "PUBLISHED") return { faq };

  const updated = await prisma.customerSupportFaq.update({
    where: { id: faqId },
    data: { status: "PUBLISHED", reviewerId: userId, publishedAt: new Date() },
  });
  await logCustomerSupportAction(projectId, userId, "customer_support.faq_published", "CustomerSupportFaq", faqId);
  await publishAutomationEvent({
    projectId,
    eventKey: "customer_support.faq_published",
    actorId: userId,
    payload: { faqId },
    idempotencyKey: `customer_support.faq_published:${faqId}`,
  });
  return { faq: updated };
}

export async function archiveFaq(projectId: string, userId: string, faqId: string) {
  const faq = await getFaq(projectId, faqId);
  if (!faq) return { error: "FAQ no encontrada." };
  const updated = await prisma.customerSupportFaq.update({ where: { id: faqId }, data: { status: "ARCHIVED" } });
  await logCustomerSupportAction(projectId, userId, "customer_support.faq_archived", "CustomerSupportFaq", faqId);
  return { faq: updated };
}

export async function duplicateFaq(projectId: string, userId: string, faqId: string) {
  const faq = await getFaq(projectId, faqId);
  if (!faq) return { error: "FAQ no encontrada." };
  const created = await prisma.customerSupportFaq.create({
    data: {
      projectId,
      authorId: userId,
      question: `${faq.question} (copia)`,
      answer: faq.answer,
      category: faq.category,
      aliases: faq.aliases,
      priority: faq.priority,
      language: faq.language,
      relatedLink: faq.relatedLink,
      status: "DRAFT",
    },
  });
  return { id: created.id };
}

// ---------------------------------------------------------------------------
// Import / export (spec section 9) - always land as DRAFT, never auto-publish.
// ---------------------------------------------------------------------------

const CSV_HEADERS = ["question", "answer", "category", "aliases", "priority", "language", "relatedLink"];
const MAX_IMPORT_ROWS = 500;

export interface FaqImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export async function importFaqsFromCsv(projectId: string, userId: string, csvText: string): Promise<FaqImportResult> {
  const { rows } = parseCsv(csvText);
  return importFaqRows(projectId, userId, rows.slice(0, MAX_IMPORT_ROWS));
}

async function importFaqRows(projectId: string, userId: string, rows: string[][]): Promise<FaqImportResult> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const [question, answer, category, aliasesRaw, priorityRaw, language, relatedLink] = row;
    if (!question?.trim() || !answer?.trim()) {
      skipped++;
      continue;
    }
    if (question.length > CUSTOMER_SUPPORT_LIMITS.MAX_QUESTION_LENGTH || answer.length > CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH) {
      skipped++;
      errors.push(`Fila omitida (excede el largo maximo): "${question.slice(0, 60)}"`);
      continue;
    }
    const aliases = (aliasesRaw ?? "")
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_ALIASES);
    const priority = Number(priorityRaw) || 0;

    await createFaq(projectId, userId, {
      question: question.trim(),
      answer: answer.trim(),
      category: category?.trim() || null,
      aliases,
      priority,
      language: language?.trim() || "es",
      relatedLink: relatedLink?.trim() || null,
    });
    created++;
  }

  return { created, skipped, errors };
}

export async function importFaqsFromJson(projectId: string, userId: string, jsonText: string): Promise<FaqImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { created: 0, skipped: 0, errors: ["JSON no valido."] };
  }
  if (!Array.isArray(parsed)) return { created: 0, skipped: 0, errors: ["El JSON debe ser un arreglo de objetos FAQ."] };

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of parsed.slice(0, MAX_IMPORT_ROWS)) {
    if (typeof item !== "object" || item === null) {
      skipped++;
      continue;
    }
    const record = item as Record<string, unknown>;
    const question = typeof record.question === "string" ? record.question.trim() : "";
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    if (!question || !answer) {
      skipped++;
      continue;
    }
    if (question.length > CUSTOMER_SUPPORT_LIMITS.MAX_QUESTION_LENGTH || answer.length > CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH) {
      skipped++;
      errors.push(`Fila omitida (excede el largo maximo): "${question.slice(0, 60)}"`);
      continue;
    }
    const aliases = Array.isArray(record.aliases) ? record.aliases.filter((a): a is string => typeof a === "string").slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_ALIASES) : [];

    await createFaq(projectId, userId, {
      question,
      answer,
      category: typeof record.category === "string" ? record.category : null,
      aliases,
      priority: typeof record.priority === "number" ? record.priority : 0,
      language: typeof record.language === "string" ? record.language : "es",
      relatedLink: typeof record.relatedLink === "string" ? record.relatedLink : null,
    });
    created++;
  }

  return { created, skipped, errors };
}

export async function exportFaqsAsCsv(projectId: string): Promise<string> {
  const faqs = await prisma.customerSupportFaq.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const rows = faqs.map((f) => [f.question, f.answer, f.category ?? "", f.aliases.join("|"), String(f.priority), f.language, f.relatedLink ?? ""]);
  return serializeCsv(CSV_HEADERS, rows);
}

export async function exportFaqsAsJson(projectId: string): Promise<string> {
  const faqs = await prisma.customerSupportFaq.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return JSON.stringify(
    faqs.map((f) => ({
      question: f.question,
      answer: f.answer,
      category: f.category,
      aliases: f.aliases,
      priority: f.priority,
      language: f.language,
      relatedLink: f.relatedLink,
      status: f.status,
    })),
    null,
    2
  );
}

import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { normalizeAndValidateHostname } from "@/lib/customer-support/hostname";

/**
 * Per-project widget configuration + activation gate (Fase 40 spec sections
 * 2, 6, 23) - the agent stays inactive by default; `activateAgent` is the
 * ONE place that flips `active`, and only after re-checking every real
 * prerequisite server-side (never trusting a client-side "all checks
 * passed" flag).
 */

function generatePublicId(): string {
  // 16 random bytes -> 32 hex chars, same entropy/format as WorkflowAutomationTrigger.webhookPublicId (src/lib/automations/webhook-signature.ts's generateWebhookPublicId).
  return randomBytes(16).toString("hex");
}

export async function getConfig(projectId: string) {
  return prisma.customerSupportConfig.findUnique({ where: { projectId } });
}

/** Public-endpoint lookup - resolves a project ONLY via the opaque publicId, never the internal cuid (spec section 25). */
export async function getConfigByPublicId(publicId: string) {
  return prisma.customerSupportConfig.findUnique({ where: { publicId } });
}

export async function getOrCreateConfig(projectId: string) {
  const existing = await prisma.customerSupportConfig.findUnique({ where: { projectId } });
  if (existing) return existing;
  return prisma.customerSupportConfig.create({ data: { projectId, publicId: generatePublicId() } });
}

export interface PublicWidgetBootstrap {
  publicId: string;
  agentName: string;
  welcomeMessage: string;
  buttonText: string;
  suggestedQuestions: string[];
  language: string;
  position: "LEFT" | "RIGHT";
  includedPaths: string[];
  excludedPaths: string[];
  offHoursMessage: string | null;
  humanHandoffEnabled: boolean;
  privacyText: string;
  appearanceTheme: string;
}

function toPublicBootstrap(config: { publicId: string; agentName: string; welcomeMessage: string; buttonText: string; suggestedQuestions: string[]; language: string; position: string; includedPaths: string[]; excludedPaths: string[]; offHoursMessage: string | null; humanHandoffEnabled: boolean; privacyText: string; appearanceTheme: string }): PublicWidgetBootstrap {
  return {
    publicId: config.publicId,
    agentName: config.agentName,
    welcomeMessage: config.welcomeMessage,
    buttonText: config.buttonText,
    suggestedQuestions: config.suggestedQuestions,
    language: config.language,
    position: config.position as "LEFT" | "RIGHT",
    includedPaths: config.includedPaths,
    excludedPaths: config.excludedPaths,
    offHoursMessage: config.offHoursMessage,
    humanHandoffEnabled: config.humanHandoffEnabled,
    privacyText: config.privacyText,
    appearanceTheme: config.appearanceTheme,
  };
}

/**
 * Resolves which (if any) project's widget should render for a given public
 * hostname (Fase 40's THIRD correction, spec sections 1, 4) — replaces the
 * earlier "first activated project wins" heuristic, which was unsafe once
 * more than one project could activate the public widget: `activatedAt` is
 * NEVER used as a selector anymore, and there is NO fallback to a different
 * project under any circumstance. Ambiguity (no binding, disabled binding,
 * inactive agent, or a binding whose config doesn't match the same project)
 * always resolves to `null` — never renders the widget, never leaks any
 * configuration.
 *
 * Resolution is a real, exclusive, database-enforced lookup:
 *   hostname -> normalizeAndValidateHostname -> CustomerSupportPublicSite
 *   (status ACTIVE, normalizedHostname unique) -> CustomerSupportConfig
 *   (same projectId, active: true) -> PublicWidgetBootstrap
 *
 * The internal `projectId` is NEVER included in the returned shape — only
 * the same public-safe subset the in-dashboard bootstrap already uses.
 *
 * `includedPaths`/`excludedPaths` remain the real source of truth for WHICH
 * PAGES actually show the button (spec section 8) — enforced both
 * client-side (defense-in-depth, `usePathname()`) AND server-side (the
 * public chat endpoint re-validates the visitor-supplied page against them,
 * see customer-support-widget.ts) — this function only decides WHICH
 * project's rules apply for a given hostname, never which pages.
 */
export async function resolveActivePublicConfig(hostname: string): Promise<PublicWidgetBootstrap | null> {
  const validation = normalizeAndValidateHostname(hostname, { allowLocalhost: process.env.NODE_ENV !== "production" });
  if (!validation.ok || !validation.normalizedHostname) return null;

  const site = await prisma.customerSupportPublicSite.findUnique({ where: { normalizedHostname: validation.normalizedHostname } });
  if (!site || site.status !== "ACTIVE") return null;

  const config = await prisma.customerSupportConfig.findUnique({ where: { id: site.customerSupportConfigId } });
  if (!config || !config.active || config.projectId !== site.projectId) return null;

  return toPublicBootstrap(config);
}

export interface UpdateConfigInput {
  agentName?: string;
  welcomeMessage?: string;
  buttonText?: string;
  suggestedQuestions?: string[];
  language?: string;
  tone?: "NEUTRAL" | "FRIENDLY" | "FORMAL" | "CONCISE";
  position?: "LEFT" | "RIGHT";
  includedPaths?: string[];
  excludedPaths?: string[];
  allowedDomains?: string[];
  offHoursMessage?: string | null;
  humanHandoffEnabled?: boolean;
  maxMessagesPerConversation?: number;
  retentionDays?: number;
  privacyText?: string;
  appearanceTheme?: "DEFAULT" | "MINIMAL" | "BOLD";
}

export async function updateConfig(projectId: string, userId: string, input: UpdateConfigInput) {
  await getOrCreateConfig(projectId);
  const updated = await prisma.customerSupportConfig.update({ where: { projectId }, data: input });
  await logCustomerSupportAction(projectId, userId, "customer_support.config_updated", "CustomerSupportConfig", updated.id);
  return updated;
}

export async function markTestCompleted(projectId: string) {
  await prisma.customerSupportConfig.updateMany({ where: { projectId }, data: { testCompletedAt: new Date() } });
}

export interface ActivationChecklist {
  hasValidConfig: boolean;
  hasPublishedFaqOrApprovedSource: boolean;
  publishedFaqCount: number;
  approvedKnowledgeCount: number;
  hasPrivacyText: boolean;
  hasWelcomeMessage: boolean;
  testCompleted: boolean;
  includedPaths: string[];
  excludedPaths: string[];
  allowedDomains: string[];
  readyToActivate: boolean;
  warnings: string[];
}

/** Real, server-computed activation prerequisites (spec section 23) - never a bare toggle. */
export async function getActivationChecklist(projectId: string): Promise<ActivationChecklist> {
  const config = await getOrCreateConfig(projectId);
  const [publishedFaqCount, approvedKnowledgeCount] = await Promise.all([
    prisma.customerSupportFaq.count({ where: { projectId, status: "PUBLISHED" } }),
    prisma.customerSupportKnowledgeSource.count({ where: { projectId, status: "APPROVED", visibility: "PUBLIC" } }),
  ]);

  const hasPrivacyText = config.privacyText.trim().length > 0;
  const hasWelcomeMessage = config.welcomeMessage.trim().length > 0;
  const hasValidConfig = hasPrivacyText && hasWelcomeMessage;
  const hasPublishedFaqOrApprovedSource = publishedFaqCount > 0 || approvedKnowledgeCount > 0;
  const testCompleted = config.testCompletedAt !== null;

  const warnings: string[] = [];
  if (!hasPublishedFaqOrApprovedSource) warnings.push("No hay ninguna FAQ publicada ni fuente de conocimiento aprobada todavia.");
  if (!testCompleted) warnings.push("Todavia no se completo una prueba real del agente.");
  if (!hasPrivacyText) warnings.push("Falta el texto de privacidad.");

  return {
    hasValidConfig,
    hasPublishedFaqOrApprovedSource,
    publishedFaqCount,
    approvedKnowledgeCount,
    hasPrivacyText,
    hasWelcomeMessage,
    testCompleted,
    includedPaths: config.includedPaths,
    excludedPaths: config.excludedPaths,
    allowedDomains: config.allowedDomains,
    readyToActivate: hasValidConfig && hasPublishedFaqOrApprovedSource && testCompleted,
    warnings,
  };
}

export async function activateAgent(projectId: string, userId: string): Promise<{ error?: string }> {
  const checklist = await getActivationChecklist(projectId);
  if (!checklist.readyToActivate) {
    return { error: `No se puede activar todavia: ${checklist.warnings.join(" ")}` };
  }
  await prisma.customerSupportConfig.update({ where: { projectId }, data: { active: true, activatedAt: new Date(), activatedById: userId } });
  await logCustomerSupportAction(projectId, userId, "customer_support.enabled", "CustomerSupportConfig", projectId);
  await publishAutomationEvent({
    projectId,
    eventKey: "customer_support.enabled",
    actorId: userId,
    payload: { activatedById: userId },
    idempotencyKey: `customer_support.enabled:${projectId}:${Date.now()}`,
  });
  return {};
}

export async function deactivateAgent(projectId: string, userId: string): Promise<{ error?: string }> {
  const config = await getConfig(projectId);
  if (!config) return { error: "No hay configuracion de soporte para este proyecto." };
  await prisma.customerSupportConfig.update({ where: { projectId }, data: { active: false } });
  await logCustomerSupportAction(projectId, userId, "customer_support.disabled", "CustomerSupportConfig", projectId);
  await publishAutomationEvent({
    projectId,
    eventKey: "customer_support.disabled",
    actorId: userId,
    payload: { deactivatedById: userId },
    idempotencyKey: `customer_support.disabled:${projectId}:${Date.now()}`,
  });
  return {};
}

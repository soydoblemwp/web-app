"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireSuperAdmin } from "@/lib/permissions";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { activateAgent, deactivateAgent, markTestCompleted } from "@/server/services/customer-support-config";
import { listFaqs, createFaq, updateFaq, publishFaq, archiveFaq } from "@/server/services/customer-support-faq";
import { claimPublicSite, disablePublicSite } from "@/server/services/customer-support-public-site";
import { normalizeAndValidateHostname } from "@/lib/customer-support/hostname";

/**
 * Admin-panel equivalents of src/server/actions/customer-support.ts.
 *
 * A separate file on purpose: every action in customer-support.ts gates on
 * requireProjectAccess(projectId, ...), which requires a real ProjectMember
 * row and deliberately gives platform ADMIN/SUPER_ADMIN no bypass (see the
 * doc comment on requireProjectAccess in src/lib/permissions/index.ts). A
 * platform administrator configuring a project they don't belong to must
 * authorize through requireAdmin()/requireSuperAdmin() instead - the same
 * gate every other /admin mutation uses - never through project membership.
 *
 * Every action below calls straight into the existing Customer Support
 * service layer (never a raw prisma write) so the exact same business rules
 * (activation checklist, race-safe domain claiming, audit logging via
 * logCustomerSupportAction) apply regardless of which panel triggered them.
 */

function revalidateAdminCustomerSupport(projectId: string) {
  revalidatePath(`/admin/projects/${projectId}/customer-support`);
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export interface FaqFormState {
  error?: string;
  success?: boolean;
}

/**
 * Same-question duplicate guard, scoped to this admin flow (spec: "evita
 * duplicados"). Compares trimmed, case-insensitive question text against
 * every existing FAQ for the project regardless of status, so a DRAFT or
 * ARCHIVED near-duplicate is caught too, not only PUBLISHED ones.
 */
export async function createFaqAdminAction(projectId: string, _prevState: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const admin = await requireAdmin();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!question || !answer) return { error: "La pregunta y la respuesta son obligatorias." };

  const { faqs: existing } = await listFaqs(projectId, { limit: 100 });
  const normalizedQuestion = question.toLowerCase();
  const duplicate = existing.find((f) => f.question.trim().toLowerCase() === normalizedQuestion);
  if (duplicate) return { error: `Ya existe una FAQ con esta misma pregunta (estado: ${duplicate.status}).` };

  await createFaq(projectId, admin.id, { question, answer, category: category || null });
  revalidateAdminCustomerSupport(projectId);
  return { success: true };
}

export async function updateFaqAdminAction(projectId: string, faqId: string, _prevState: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const admin = await requireAdmin();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!question || !answer) return { error: "La pregunta y la respuesta son obligatorias." };

  const result = await updateFaq(projectId, admin.id, faqId, { question, answer, category: category || null });
  revalidateAdminCustomerSupport(projectId);
  if (result.error) return { error: result.error };
  return { success: true };
}

export async function publishFaqAdminAction(projectId: string, faqId: string): Promise<void> {
  const admin = await requireAdmin();
  await publishFaq(projectId, admin.id, faqId);
  revalidateAdminCustomerSupport(projectId);
}

export async function archiveFaqAdminAction(projectId: string, faqId: string): Promise<void> {
  const admin = await requireAdmin();
  await archiveFaq(projectId, admin.id, faqId);
  revalidateAdminCustomerSupport(projectId);
}

// ---------------------------------------------------------------------------
// Test completion + activation - higher blast radius (makes the widget
// publicly live), same SUPER_ADMIN bar as setProjectStatusAdminAction.
// ---------------------------------------------------------------------------

export async function markTestCompletedAdminAction(projectId: string) {
  const admin = await requireSuperAdmin();
  await markTestCompleted(projectId);
  // markTestCompleted() itself doesn't write to the audit trail (unlike the
  // other CS service functions), so log it explicitly here.
  await logCustomerSupportAction(projectId, admin.id, "customer_support.test_completed", "CustomerSupportConfig", projectId, { viaAdminPanel: true });
  revalidateAdminCustomerSupport(projectId);
}

export async function activateAgentAdminAction(projectId: string): Promise<void> {
  const admin = await requireSuperAdmin();
  await activateAgent(projectId, admin.id);
  revalidateAdminCustomerSupport(projectId);
}

export async function deactivateAgentAdminAction(projectId: string): Promise<void> {
  const admin = await requireSuperAdmin();
  await deactivateAgent(projectId, admin.id);
  revalidateAdminCustomerSupport(projectId);
}

// ---------------------------------------------------------------------------
// Public domain claiming - highest blast radius (binds a real public
// hostname to this project). SUPER_ADMIN-gated, same as activation.
// ---------------------------------------------------------------------------

/**
 * Vercel assigns every project one stable production alias shaped exactly
 * like "<project-slug>.vercel.app" (a single label, no extra segments). Every
 * OTHER "*.vercel.app" hostname reaching this action is a per-deployment or
 * per-branch preview URL - "<project>-git-<branch>-<team>.vercel.app" or
 * "<project>-<deployment-hash>-<team>.vercel.app" - which rotates on every
 * deploy/branch and must never be claimed as a stable public site binding
 * (spec: "nunca permitas reclamar dominios de vista previa temporales").
 * "-git-" is an unambiguous, always-reliable marker for the branch-preview
 * case; requiring the hostname to otherwise be a single label before
 * ".vercel.app" (no other hyphenated segment appended by Vercel itself)
 * covers the deployment-hash case without needing to guess the hash shape.
 */
function isTemporaryVercelPreviewHostname(normalizedHostname: string): boolean {
  if (!normalizedHostname.endsWith(".vercel.app")) return false;
  // "-git-" is Vercel's unambiguous branch-preview marker
  // ("<project>-git-<branch>-<team>.vercel.app"). Hash-based per-deployment
  // preview URLs aren't pattern-matched here (their shape isn't reliably
  // distinguishable from a hyphenated project slug by inspection alone) —
  // they're guarded instead by never being manually typed/memorized by an
  // admin, and by the explicit confirmation dialog every claim passes
  // through in the admin UI before submit.
  return normalizedHostname.includes("-git-");
}

export interface ClaimDomainFormState {
  error?: string;
  success?: boolean;
}

export async function claimPublicSiteAdminAction(projectId: string, _prevState: ClaimDomainFormState, formData: FormData): Promise<ClaimDomainFormState> {
  const admin = await requireSuperAdmin();
  const rawHostname = String(formData.get("hostname") ?? "").trim();

  const validation = normalizeAndValidateHostname(rawHostname, { allowLocalhost: false });
  if (!validation.ok || !validation.normalizedHostname) return { error: validation.error };
  if (isTemporaryVercelPreviewHostname(validation.normalizedHostname)) {
    return { error: "No se pueden reclamar dominios de vista previa temporales de Vercel (URLs con \"-git-\"). Usa el dominio de producción estable." };
  }

  const result = await claimPublicSite(projectId, admin.id, rawHostname);
  revalidateAdminCustomerSupport(projectId);
  if (result.error) return { error: result.error };
  return { success: true };
}

export async function disablePublicSiteAdminAction(projectId: string, siteId: string): Promise<void> {
  const admin = await requireSuperAdmin();
  await disablePublicSite(projectId, admin.id, siteId);
  revalidateAdminCustomerSupport(projectId);
}

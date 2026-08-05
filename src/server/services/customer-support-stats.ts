import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Real, project-scoped statistics for the Customer Support Center main page
 * (Fase 40 spec section 4) - every number here comes from an actual COUNT
 * query, never a placeholder. Test-mode conversations (isTest: true) are
 * always excluded (spec section 22).
 */

export interface CustomerSupportDashboardStats {
  agentActive: boolean;
  conversationsToday: number;
  openConversations: number;
  resolvedByFaq: number;
  resolvedByAi: number;
  unanswered: number;
  handoffRequests: number;
  resolutionRatePercent: number;
  positiveFeedback: number;
  negativeFeedback: number;
  topFaqs: { id: string; question: string; publishedAt: Date | null }[];
  outdatedSources: number;
  recentConversations: { id: string; publicId: string; startedAt: Date; status: string; lastResponseType: string | null; escalated: boolean; originPage: string | null }[];
}

export async function getDashboardStats(projectId: string): Promise<CustomerSupportDashboardStats> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    config,
    conversationsToday,
    openConversations,
    resolvedByFaq,
    resolvedByAi,
    unanswered,
    handoffRequests,
    totalConversations,
    positiveFeedback,
    negativeFeedback,
    topFaqs,
    outdatedSources,
    recentConversations,
  ] = await Promise.all([
    prisma.customerSupportConfig.findUnique({ where: { projectId }, select: { active: true } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false, startedAt: { gte: todayStart } } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false, status: "ACTIVE" } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false, lastResponseType: "FAQ" } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false, lastResponseType: "AI_ASSISTED" } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false, lastResponseType: "FALLBACK" } }),
    prisma.customerSupportHandoff.count({ where: { projectId } }),
    prisma.customerSupportConversation.count({ where: { projectId, isTest: false } }),
    prisma.customerSupportMessage.count({ where: { projectId, feedback: "POSITIVE" } }),
    prisma.customerSupportMessage.count({ where: { projectId, feedback: "NEGATIVE" } }),
    prisma.customerSupportFaq.findMany({ where: { projectId, status: "PUBLISHED" }, orderBy: { priority: "desc" }, take: 5, select: { id: true, question: true, publishedAt: true } }),
    prisma.customerSupportKnowledgeSource.count({ where: { projectId, status: "OUTDATED" } }),
    prisma.customerSupportConversation.findMany({
      where: { projectId, isTest: false },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, publicId: true, startedAt: true, status: true, lastResponseType: true, escalated: true, originPage: true },
    }),
  ]);

  const resolvedCount = resolvedByFaq + resolvedByAi;
  const resolutionRatePercent = totalConversations > 0 ? Math.round((resolvedCount / totalConversations) * 100) : 0;

  return {
    agentActive: config?.active ?? false,
    conversationsToday,
    openConversations,
    resolvedByFaq,
    resolvedByAi,
    unanswered,
    handoffRequests,
    resolutionRatePercent,
    positiveFeedback,
    negativeFeedback,
    topFaqs,
    outdatedSources,
    recentConversations,
  };
}

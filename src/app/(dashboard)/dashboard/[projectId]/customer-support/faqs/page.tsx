import type { Metadata } from "next";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { listFaqsAction } from "@/server/actions/customer-support";
import { FaqAdmin } from "@/components/customer-support/faq-admin";

export const metadata: Metadata = { title: "FAQ — Servicio al cliente" };

export default async function CustomerSupportFaqsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "EDITOR");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const result = await listFaqsAction(projectId, {});
  const faqs = "error" in result ? [] : result.faqs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h1>
        <p className="text-sm text-muted-foreground">Solo las FAQ publicadas se usan en el widget publico. La publicacion siempre es humana.</p>
      </div>
      <FaqAdmin
        projectId={projectId}
        isManager={isManager}
        initialFaqs={faqs.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          category: f.category,
          aliases: f.aliases,
          priority: f.priority,
          language: f.language,
          relatedLink: f.relatedLink,
          status: f.status,
          publishedAt: f.publishedAt ? f.publishedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}

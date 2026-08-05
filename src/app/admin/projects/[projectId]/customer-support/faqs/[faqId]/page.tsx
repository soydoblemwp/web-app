import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFaq } from "@/server/services/customer-support-faq";
import { publishFaqAdminAction, archiveFaqAdminAction } from "@/server/actions/admin-customer-support";
import { FaqForm } from "@/components/admin/customer-support/faq-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Editar FAQ" };

export default async function AdminEditFaqPage({
  params,
}: {
  params: Promise<{ projectId: string; faqId: string }>;
}) {
  const { projectId, faqId } = await params;

  const faq = await getFaq(projectId, faqId);
  if (!faq) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editar FAQ</h1>
          <p className="text-sm text-muted-foreground">{faq.question}</p>
        </div>
        <StatusBadge status={faq.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contenido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {faq.status === "PUBLISHED" ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Esta FAQ está publicada — archívala antes de editar su contenido, o crea una nueva.</p>
          ) : (
            <FaqForm projectId={projectId} faq={{ id: faq.id, question: faq.question, answer: faq.answer, category: faq.category }} />
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {faq.status === "DRAFT" ? (
              <form action={publishFaqAdminAction.bind(null, projectId, faq.id)}>
                <Button type="submit" variant="outline" size="sm">
                  Publicar
                </Button>
              </form>
            ) : null}
            {faq.status !== "ARCHIVED" ? (
              <form action={archiveFaqAdminAction.bind(null, projectId, faq.id)}>
                <ConfirmSubmitButton variant="outline" size="sm" confirmMessage="¿Archivar esta FAQ?">
                  Archivar
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" render={<Link href={`/admin/projects/${projectId}/customer-support`}>← Volver al agente de soporte</Link>} />
    </div>
  );
}

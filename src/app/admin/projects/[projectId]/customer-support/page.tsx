import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateConfig, getActivationChecklist } from "@/server/services/customer-support-config";
import { listFaqs } from "@/server/services/customer-support-faq";
import { listPublicSites } from "@/server/services/customer-support-public-site";
import {
  markTestCompletedAdminAction,
  activateAgentAdminAction,
  deactivateAgentAdminAction,
  publishFaqAdminAction,
  archiveFaqAdminAction,
  disablePublicSiteAdminAction,
} from "@/server/actions/admin-customer-support";
import { FaqForm } from "@/components/admin/customer-support/faq-form";
import { ClaimDomainForm } from "@/components/admin/customer-support/claim-domain-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Agente de soporte" };

export default async function AdminCustomerSupportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) notFound();

  // getOrCreateConfig is idempotent (find-or-create) — safe to call on every
  // page load, and is the exact function the spec requires this admin view
  // to use to "ver, crear o reutilizar la configuración."
  const [config, checklist, { faqs }, sites] = await Promise.all([
    getOrCreateConfig(projectId),
    getActivationChecklist(projectId),
    listFaqs(projectId, { limit: 100 }),
    listPublicSites(projectId),
  ]);

  const draftOrPublished = faqs.filter((f) => f.status !== "ARCHIVED");
  const archived = faqs.filter((f) => f.status === "ARCHIVED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agente de soporte · {project.name}</h1>
          <p className="text-sm text-muted-foreground">Configuración, FAQs y dominio público del Customer Support Agent.</p>
        </div>
        <Badge variant={config.active ? "secondary" : "outline"} className="text-sm">
          {config.active ? "ACTIVO" : "INACTIVO"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración actual</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Nombre del agente</p>
            <p className="text-sm">{config.agentName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Texto del botón</p>
            <p className="text-sm">{config.buttonText}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Mensaje de bienvenida</p>
            <p className="text-sm">{config.welcomeMessage || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Texto de privacidad</p>
            <p className="text-sm">{config.privacyText || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requisitos de activación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            <li>{checklist.hasWelcomeMessage ? "✅" : "❌"} Mensaje de bienvenida configurado</li>
            <li>{checklist.hasPrivacyText ? "✅" : "❌"} Texto de privacidad configurado</li>
            <li>
              {checklist.hasPublishedFaqOrApprovedSource ? "✅" : "❌"} Al menos una FAQ publicada o fuente aprobada ({checklist.publishedFaqCount}{" "}
              FAQ publicadas, {checklist.approvedKnowledgeCount} fuentes aprobadas)
            </li>
            <li>{checklist.testCompleted ? "✅" : "❌"} Prueba del agente completada</li>
          </ul>

          {checklist.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {checklist.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!checklist.testCompleted ? (
              <form action={markTestCompletedAdminAction.bind(null, projectId)}>
                <ConfirmSubmitButton variant="outline" size="sm" confirmMessage="¿Marcar la prueba del agente como completada?">
                  Marcar prueba como completada
                </ConfirmSubmitButton>
              </form>
            ) : null}

            {config.active ? (
              <form action={deactivateAgentAdminAction.bind(null, projectId)}>
                <ConfirmSubmitButton variant="destructive" size="sm" confirmMessage="¿Desactivar el agente de soporte? Dejará de responder en el sitio público.">
                  Desactivar agente
                </ConfirmSubmitButton>
              </form>
            ) : (
              <form action={activateAgentAdminAction.bind(null, projectId)}>
                <ConfirmSubmitButton size="sm" disabled={!checklist.readyToActivate} confirmMessage="¿Activar el agente de soporte para este proyecto?">
                  Activar agente
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAQs ({draftOrPublished.length} activas, {archived.length} archivadas)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Pregunta</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {faqs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      Todavía no hay FAQs.
                    </td>
                  </tr>
                ) : (
                  faqs.map((faq) => (
                    <tr key={faq.id}>
                      <td className="px-3 py-2">
                        <Link href={`/admin/projects/${projectId}/customer-support/faqs/${faq.id}`} className="hover:underline">
                          {faq.question}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={faq.status} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nueva FAQ</h3>
            <FaqForm projectId={projectId} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dominios públicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún dominio reclamado todavía.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sites.map((site) => (
                <li key={site.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate">{site.hostname}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={site.status} />
                    {site.status !== "DISABLED" ? (
                      <form action={disablePublicSiteAdminAction.bind(null, projectId, site.id)}>
                        <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`¿Desactivar el dominio "${site.hostname}"?`}>
                          Desactivar
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reclamar dominio</h3>
            <ClaimDomainForm projectId={projectId} />
          </div>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" render={<Link href={`/admin/projects/${projectId}`}>← Volver al proyecto</Link>} />
    </div>
  );
}

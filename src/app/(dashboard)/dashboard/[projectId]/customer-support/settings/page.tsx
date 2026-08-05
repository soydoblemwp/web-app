import type { Metadata } from "next";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { getCustomerSupportConfigAction, getActivationChecklistAction, listPublicSitesAction } from "@/server/actions/customer-support";
import { SettingsConsole } from "@/components/customer-support/settings-console";

export const metadata: Metadata = { title: "Configuracion — Servicio al cliente" };

export default async function CustomerSupportSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "EDITOR");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const [config, checklist, publicSites] = await Promise.all([getCustomerSupportConfigAction(projectId), getActivationChecklistAction(projectId), listPublicSitesAction(projectId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuracion del agente</h1>
        <p className="text-sm text-muted-foreground">El agente permanece desactivado hasta que un MANAGER lo active tras configurarlo y probarlo.</p>
      </div>
      <SettingsConsole
        projectId={projectId}
        isManager={isManager}
        config={{
          active: config.active,
          publicId: config.publicId,
          updatedAt: config.updatedAt.toISOString(),
          agentName: config.agentName,
          welcomeMessage: config.welcomeMessage,
          buttonText: config.buttonText,
          suggestedQuestions: config.suggestedQuestions,
          language: config.language,
          tone: config.tone,
          position: config.position,
          includedPaths: config.includedPaths,
          excludedPaths: config.excludedPaths,
          allowedDomains: config.allowedDomains,
          offHoursMessage: config.offHoursMessage,
          humanHandoffEnabled: config.humanHandoffEnabled,
          maxMessagesPerConversation: config.maxMessagesPerConversation,
          retentionDays: config.retentionDays,
          privacyText: config.privacyText,
          appearanceTheme: config.appearanceTheme,
        }}
        checklist={checklist}
        publicSites={publicSites.map((s) => ({ id: s.id, hostname: s.hostname, status: s.status, verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null }))}
      />
    </div>
  );
}

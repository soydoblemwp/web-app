import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { deleteIntegrationAction, disconnectIntegrationAction } from "@/server/actions/admin";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";

export const metadata: Metadata = { title: "Administración · Integraciones" };

/**
 * Only queries the generic Integration model (type/status/timestamps/error).
 * Never touches WordPressConnection/GitHubConnection — those hold encrypted
 * credentials that must never be readable from this panel.
 */
export default async function AdminIntegrationsPage() {
  const integrations = await prisma.integration.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      lastCheckedAt: true,
      lastError: true,
      project: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          {integrations.length} integraciones de proyectos registrados. Nunca se muestran tokens, contraseñas ni
          claves cifradas.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Conectada</th>
              <th className="px-4 py-2 font-medium">Última sincronización</th>
              <th className="px-4 py-2 font-medium">Último error</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {integrations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No hay integraciones registradas.
                </td>
              </tr>
            ) : (
              integrations.map((integration) => (
                <tr key={integration.id}>
                  <td className="px-4 py-2 font-medium">{integration.type}</td>
                  <td className="px-4 py-2 text-muted-foreground">{integration.project.name}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={integration.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{integration.createdAt.toLocaleDateString("es-ES")}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {integration.lastCheckedAt ? integration.lastCheckedAt.toLocaleString("es-ES") : "Nunca"}
                  </td>
                  <td className="max-w-48 truncate px-4 py-2 text-muted-foreground">{integration.lastError || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {integration.status !== "DISCONNECTED" ? (
                        <form action={disconnectIntegrationAction.bind(null, integration.id)}>
                          <ConfirmSubmitButton
                            size="sm"
                            variant="outline"
                            confirmMessage={`¿Marcar la integración de ${integration.type} como desconectada?`}
                          >
                            Desconectar
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                      {integration.status === "DISCONNECTED" || integration.status === "ERROR" ? (
                        <form action={deleteIntegrationAction.bind(null, integration.id)}>
                          <ConfirmSubmitButton
                            size="sm"
                            variant="destructive"
                            confirmMessage={`¿Eliminar definitivamente esta conexión rota de ${integration.type}?`}
                          >
                            Eliminar
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
    </div>
  );
}

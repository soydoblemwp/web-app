import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Administración · Auditoría" };

export default async function AuditLogPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Registro de auditoría</h1>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay acciones administrativas registradas todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Objetivo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 text-muted-foreground">{log.createdAt.toLocaleString("es-ES")}</td>
                  <td className="px-4 py-2">{log.actor?.name || log.actor?.email || "Sistema"}</td>
                  <td className="px-4 py-2">{log.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {log.targetType} {log.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

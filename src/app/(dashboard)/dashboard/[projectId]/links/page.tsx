import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { recheckLinkAction, toggleIgnoreLinkAction, deleteLinkCheckAction } from "@/server/actions/link-checker";
import { CheckLinkForm } from "@/components/links/check-link-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Enlaces" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OK: "secondary",
  REDIRECT: "default",
  BROKEN: "destructive",
  ERROR: "destructive",
  UNKNOWN: "outline",
};

export default async function LinksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const links = await prisma.linkCheck.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verificador de enlaces</h1>
        <p className="text-sm text-muted-foreground">
          Comprueba el estado HTTP, redirecciones y disponibilidad de tus enlaces. Protegido contra SSRF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comprobar una URL</CardTitle>
        </CardHeader>
        <CardContent>
          <CheckLinkForm projectId={projectId} />
        </CardContent>
      </Card>

      {links.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Link2 className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay enlaces comprobados todavía.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">HTTP</th>
                <th className="px-4 py-2 font-medium">Última comprobación</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {links.map((link) => (
                <tr key={link.id} className={link.isIgnored ? "opacity-50" : undefined}>
                  <td className="max-w-xs truncate px-4 py-2">{link.url}</td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[link.status]}>{link.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{link.httpStatus ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {link.lastCheckedAt ? link.lastCheckedAt.toLocaleString("es-ES") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <form action={recheckLinkAction.bind(null, projectId, link.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          Repetir
                        </Button>
                      </form>
                      <form action={toggleIgnoreLinkAction.bind(null, projectId, link.id, !link.isIgnored)}>
                        <Button type="submit" size="sm" variant="outline">
                          {link.isIgnored ? "Restaurar" : "Ignorar"}
                        </Button>
                      </form>
                      <form action={deleteLinkCheckAction.bind(null, projectId, link.id)}>
                        <Button type="submit" size="sm" variant="ghost">
                          Eliminar
                        </Button>
                      </form>
                    </div>
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

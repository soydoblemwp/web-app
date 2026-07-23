import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { retestWordPressConnectionAction, disconnectWordPressAction } from "@/server/actions/integrations";
import { WordPressConnectionForm } from "@/components/integrations/wordpress-connection-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "WordPress" };

export default async function WordPressIntegrationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const connection = await prisma.wordPressConnection.findUnique({ where: { projectId } });

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WordPress</h1>
          <p className="text-sm text-muted-foreground">Conecta tu sitio mediante la API REST oficial de WordPress.</p>
        </div>
      </div>

      {connection ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{connection.siteUrl}</CardTitle>
            <Badge variant={connection.status === "CONNECTED" ? "secondary" : "destructive"}>
              {connection.status === "CONNECTED" ? "Conectado" : connection.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Usuario: {connection.username} · Última verificación:{" "}
              {connection.lastVerifiedAt ? connection.lastVerifiedAt.toLocaleString("es-ES") : "nunca"}
            </p>
            <div className="flex gap-2">
              <form
                action={async () => {
                  "use server";
                  await retestWordPressConnectionAction(projectId);
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  Probar conexión
                </Button>
              </form>
              <form action={disconnectWordPressAction.bind(null, projectId)}>
                <Button type="submit" variant="ghost" size="sm">
                  Desconectar
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">No configurada. Añade tus credenciales para conectar.</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{connection ? "Actualizar credenciales" : "Conectar WordPress"}</CardTitle>
        </CardHeader>
        <CardContent>
          <WordPressConnectionForm projectId={projectId} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Esta versión permite probar la conexión de forma real. La creación y publicación de borradores desde la
        plataforma no está implementada todavía — queda documentada como próxima mejora.
      </p>
    </div>
  );
}

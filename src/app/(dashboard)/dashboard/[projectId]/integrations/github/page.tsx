import type { Metadata } from "next";
import { GitBranch } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { disconnectGitHubAction } from "@/server/actions/integrations";
import { GitHubConnectionForm } from "@/components/integrations/github-connection-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "GitHub" };

export default async function GitHubIntegrationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const connection = await prisma.gitHubConnection.findUnique({ where: { projectId } });

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <GitBranch className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GitHub</h1>
          <p className="text-sm text-muted-foreground">Conecta una cuenta de GitHub mediante un token de acceso.</p>
        </div>
      </div>

      {connection ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">@{connection.accountLogin}</CardTitle>
            <Badge variant={connection.status === "CONNECTED" ? "secondary" : "destructive"}>
              {connection.status === "CONNECTED" ? "Conectado" : connection.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Última verificación: {connection.lastVerifiedAt ? connection.lastVerifiedAt.toLocaleString("es-ES") : "nunca"}
            </p>
            <form action={disconnectGitHubAction.bind(null, projectId)}>
              <Button type="submit" variant="ghost" size="sm">
                Desconectar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">No configurada. Añade un token para conectar.</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{connection ? "Actualizar token" : "Conectar GitHub"}</CardTitle>
        </CardHeader>
        <CardContent>
          <GitHubConnectionForm projectId={projectId} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Esta versión verifica el token y guarda la conexión de forma segura. Listar repositorios, analizar
        archivos y crear issues quedan documentados como próximas mejoras.
      </p>
    </div>
  );
}

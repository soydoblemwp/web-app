import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { removeProjectMemberAction, archiveProjectSettingsAction } from "@/server/actions/project-settings";
import { UpdateProjectForm } from "@/components/project-settings/update-project-form";
import { AddMemberForm } from "@/components/project-settings/add-member-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Configuración del proyecto" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { include: { user: { select: { name: true, email: true } } } } },
  });
  if (!project) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración del proyecto</h1>
        <p className="text-sm text-muted-foreground">Editar información, miembros y estado del proyecto.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateProjectForm project={project} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Miembros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AddMemberForm projectId={projectId} />
          <ul className="divide-y">
            {project.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{member.user.name || member.user.email}</p>
                  <p className="text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{member.role}</Badge>
                  {member.role !== "OWNER" ? (
                    <form action={removeProjectMemberAction.bind(null, projectId, member.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        Quitar
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de peligro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Archivar el proyecto lo oculta de la lista principal. Los datos no se eliminan.
          </p>
          <form action={archiveProjectSettingsAction.bind(null, projectId)}>
            <Button type="submit" variant="destructive">
              Archivar proyecto
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

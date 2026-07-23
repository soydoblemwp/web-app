import Link from "next/link";
import type { Metadata } from "next";
import { FolderKanban, Plus } from "lucide-react";
import { getDashboardContext } from "@/server/services/dashboard-context";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Proyectos" };

export default async function ProjectsPage() {
  const { user, projects, unreadNotifications } = await getDashboardContext();

  return (
    <div className="flex min-h-svh flex-col">
      <Header projects={projects} user={user} unreadNotifications={unreadNotifications} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tus proyectos</h1>
            <p className="text-sm text-muted-foreground">
              Cada proyecto agrupa el contenido, las publicaciones y la configuración de una marca o iniciativa.
            </p>
          </div>
          <Button
            render={
              <Link href="/dashboard/new">
                <Plus className="mr-1 size-4" /> Nuevo proyecto
              </Link>
            }
          />
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <FolderKanban className="size-10 text-muted-foreground" />
              <h2 className="text-lg font-medium">Todavía no tienes proyectos</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Crea tu primer proyecto para empezar a generar contenido, planificar publicaciones y usar el asistente de IA.
              </p>
              <Button
                className="mt-2"
                render={
                  <Link href="/dashboard/new">
                    <Plus className="mr-1 size-4" /> Crear proyecto
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/dashboard/${project.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {project.description || "Sin descripción."}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

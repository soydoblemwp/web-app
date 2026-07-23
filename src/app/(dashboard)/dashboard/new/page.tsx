import type { Metadata } from "next";
import { getDashboardContext } from "@/server/services/dashboard-context";
import { Header } from "@/components/layout/header";
import { CreateProjectForm } from "@/components/projects/create-project-form";

export const metadata: Metadata = { title: "Nuevo proyecto" };

export default async function NewProjectPage() {
  const { user, projects, unreadNotifications } = await getDashboardContext();

  return (
    <div className="flex min-h-svh flex-col">
      <Header projects={projects} user={user} unreadNotifications={unreadNotifications} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Nuevo proyecto</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Define la información base. Podrás completar el kit de marca más adelante.
        </p>
        <CreateProjectForm />
      </main>
    </div>
  );
}

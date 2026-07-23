import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { deleteAccountAction } from "@/server/actions/account";
import { UpdateProfileForm } from "@/components/account/update-profile-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const { error } = await searchParams;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });

  return (
    <div className="mx-auto max-w-xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateProfileForm name={user.name} timezone={user.timezone} locale={user.locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar datos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Descarga tu perfil, proyectos y contenido en un archivo JSON.
          </p>
          <Button
            variant="outline"
            render={
              <a href="/api/account/export" download>
                Exportar mis datos
              </a>
            }
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Eliminar cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error === "owns-workspace" ? (
            <p className="text-sm text-destructive">
              No puedes eliminar tu cuenta porque eres propietario de un espacio de trabajo. Elimina o transfiere
              tus proyectos primero.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">Esta acción es permanente y no se puede deshacer.</p>
          <form action={deleteAccountAction}>
            <Button type="submit" variant="destructive">
              Eliminar mi cuenta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { appConfig } from "@/lib/config";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
        <Link href="/dashboard" className="text-sm font-semibold">
          {appConfig.name}
        </Link>
        <span className="text-sm text-muted-foreground">Panel administrativo</span>
        <nav className="ml-auto flex gap-4 text-sm">
          <Link href="/admin" className="hover:underline">
            Usuarios
          </Link>
          <Link href="/admin/audit-log" className="hover:underline">
            Registro de auditoría
          </Link>
          <Link href="/dashboard" className="hover:underline">
            Volver a la app
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

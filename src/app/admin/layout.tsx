import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { appConfig } from "@/lib/config";
import { AdminNav } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4">
        <Link href="/dashboard" className="shrink-0 text-sm font-semibold">
          {appConfig.name}
        </Link>
        <span className="text-sm font-medium text-muted-foreground">Administración</span>
        <Badge variant="secondary" className="shrink-0">
          {user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN"}
        </Badge>
        <div className="flex-1" />
        <Link href="/dashboard" className="shrink-0 text-sm underline-offset-4 hover:underline">
          Volver a la aplicación
        </Link>
      </header>
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <AdminNav />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

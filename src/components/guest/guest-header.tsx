import Link from "next/link";
import { UserPlus } from "lucide-react";
import { appConfig } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Header for the whole guest experience — always shows the "Modo invitado"
 * indicator plus a way out to a real account, per spec item 11. Kept
 * visually consistent with the authenticated dashboard header
 * (see components/layout/header.tsx).
 */
export function GuestHeader() {
  return (
    <header className="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4">
      <Link href="/" className="shrink-0 text-sm font-semibold">
        {appConfig.name}
      </Link>
      <Badge variant="secondary" className="shrink-0">
        Modo invitado
      </Badge>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" render={<Link href="/login">Iniciar sesión</Link>} />
      <Button size="sm" render={
        <Link href="/register">
          <UserPlus className="mr-1 size-4" /> Crear cuenta para guardar
        </Link>
      } />
    </header>
  );
}

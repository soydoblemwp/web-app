import Link from "next/link";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/logout";

/**
 * Flat, always-visible header controls — deliberately not a dropdown menu.
 * A previous DropdownMenu-based version crashed the page when opened, and
 * it hid "Administración" behind an extra click besides. Every action here
 * is its own directly clickable/tappable element; the identity block
 * (avatar + name) is inert and never navigates.
 */
export function UserMenu({
  name,
  email,
  isAdmin,
}: {
  name: string | null;
  email: string;
  isAdmin: boolean;
}) {
  const initials = (name || email).slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-2 px-1">
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate text-sm md:inline">{name || email}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        aria-label="Mi cuenta"
        className="gap-1.5"
        render={
          <Link href="/account">
            <Settings className="size-4" />
            <span className="hidden sm:inline">Mi cuenta</span>
          </Link>
        }
      />

      {isAdmin ? (
        <Button
          variant="outline"
          size="sm"
          aria-label="Administración"
          className="gap-1.5"
          render={
            <Link href="/admin">
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Administración</span>
            </Link>
          }
        />
      ) : null}

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" aria-label="Cerrar sesión" className="gap-1.5">
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/logout";

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-32 truncate text-sm md:inline">{name || email}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link href="/account">
              <Settings className="mr-2 size-4" /> Mi cuenta
            </Link>
          }
        />
        {isAdmin ? (
          <DropdownMenuItem
            render={
              <Link href="/admin">
                <ShieldCheck className="mr-2 size-4" /> Panel administrativo
              </Link>
            }
          />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          render={
            <form action={logoutAction} className="w-full">
              <button type="submit" className="flex w-full items-center">
                <LogOut className="mr-2 size-4" /> Cerrar sesión
              </button>
            </form>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const ACCOUNT_REQUIRED_MESSAGE =
  "Esta función requiere una cuenta para guardar y sincronizar la información.";

/**
 * The dialog shown whenever a guest touches a feature that needs an account.
 * Centralized here so the wording and the login/register links stay
 * consistent everywhere it's used (see AccountGateNavItem below).
 */
export function AccountRequiredDialog({
  open,
  onOpenChange,
  featureLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{featureLabel ? `${featureLabel} requiere una cuenta` : "Función solo para cuentas"}</DialogTitle>
          <DialogDescription>{ACCOUNT_REQUIRED_MESSAGE}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Crea una cuenta gratuita o inicia sesión para guardar tu trabajo de forma permanente y acceder a esta
          función.
        </p>
        <DialogFooter>
          <Button variant="outline" render={<Link href="/login">Iniciar sesión</Link>} />
          <Button render={<Link href="/register">Crear cuenta</Link>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reusable nav item for a feature that requires an account. Looks like a
 * normal nav link (icon + label) but never navigates — clicking it opens
 * AccountRequiredDialog instead. Use this for every restricted module
 * listed in the guest panel rather than re-implementing the gate per screen.
 */
export function AccountGateNavItem({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left whitespace-nowrap">{label}</span>
        <Lock className="size-3.5 shrink-0 opacity-70" />
      </button>
      <AccountRequiredDialog open={open} onOpenChange={setOpen} featureLabel={label} />
    </>
  );
}

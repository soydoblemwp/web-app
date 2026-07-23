"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { guestNavGroups } from "@/lib/navigation";
import { AccountGateNavItem } from "@/components/guest/account-gate";
import { cn } from "@/lib/utils";

export function GuestNav() {
  const pathname = usePathname();

  return (
    <nav className="w-full shrink-0 overflow-x-auto border-b bg-sidebar text-sidebar-foreground md:h-full md:w-60 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex gap-4 px-3 py-3 md:flex-col md:gap-6 md:py-4">
        {guestNavGroups.map((group) => (
          <div key={group.label} className="shrink-0">
            <p className="mb-1 whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="flex gap-1 md:flex-col md:gap-0.5">
              {group.items.map((item) => {
                if (item.restricted || !item.href) {
                  return (
                    <li key={item.label} className="shrink-0">
                      <AccountGateNavItem label={item.label} icon={item.icon} />
                    </li>
                  );
                }
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.label} className="shrink-0">
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

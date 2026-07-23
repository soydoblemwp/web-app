"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { projectNavGroups } from "@/lib/navigation";

export function Sidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${projectId}`;

  return (
    <nav className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
        {projectNavGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const href = item.segment ? `${base}/${item.segment}` : base;
                const isActive = pathname === href;
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
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

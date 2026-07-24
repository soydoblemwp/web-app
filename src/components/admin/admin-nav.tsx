"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  Megaphone,
  Workflow,
  Plug,
  Bell,
  ClipboardList,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_NAV_ITEMS = [
  { label: "Resumen", href: "/admin", icon: LayoutDashboard },
  { label: "Usuarios", href: "/admin/users", icon: Users },
  { label: "Proyectos", href: "/admin/projects", icon: FolderKanban },
  { label: "Contenido", href: "/admin/content", icon: FileText },
  { label: "Campañas y publicaciones", href: "/admin/campaigns", icon: Megaphone },
  { label: "Automatizaciones y monitoreo", href: "/admin/operations", icon: Workflow },
  { label: "Integraciones", href: "/admin/integrations", icon: Plug },
  { label: "Notificaciones", href: "/admin/notifications", icon: Bell },
  { label: "Auditoría", href: "/admin/audit-log", icon: ClipboardList },
  { label: "Estado del sistema", href: "/admin/system", icon: Activity },
];

/** Plain links, no dropdown — a menu that can crash is worse than no menu. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-full shrink-0 overflow-x-auto border-b bg-sidebar text-sidebar-foreground md:h-full md:w-56 md:overflow-y-auto md:border-b-0 md:border-r">
      <ul className="flex gap-1 px-3 py-3 md:flex-col md:gap-0.5 md:py-4">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
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
    </nav>
  );
}

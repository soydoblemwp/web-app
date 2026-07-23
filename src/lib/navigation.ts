import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bot,
  FileText,
  Search,
  Share2,
  CalendarDays,
  Megaphone,
  Library,
  LineChart,
  MessageSquareReply,
  Handshake,
  Palette,
  Radar,
  Link2,
  Workflow,
  Globe,
  GitBranch,
  BarChart3,
  FolderKanban,
  Settings,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const projectNavGroups: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { label: "Dashboard", segment: "", icon: LayoutDashboard },
      { label: "Asistente IA", segment: "assistant", icon: Bot },
    ],
  },
  {
    label: "Creación",
    items: [
      { label: "Contenido", segment: "content", icon: FileText },
      { label: "SEO", segment: "seo", icon: Search },
      { label: "Biblioteca", segment: "library", icon: Library },
    ],
  },
  {
    label: "Redes sociales",
    items: [
      { label: "Publicaciones", segment: "social", icon: Share2 },
      { label: "Calendario", segment: "calendar", icon: CalendarDays },
      { label: "Campañas", segment: "campaigns", icon: Megaphone },
      { label: "Respuestas", segment: "replies", icon: MessageSquareReply },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { label: "Colaboraciones", segment: "collaborations", icon: Handshake },
      { label: "Monitoreo", segment: "monitoring", icon: Radar },
      { label: "Enlaces", segment: "links", icon: Link2 },
      { label: "Automatizaciones", segment: "automations", icon: Workflow },
    ],
  },
  {
    label: "Integraciones",
    items: [
      { label: "WordPress", segment: "integrations/wordpress", icon: Globe },
      { label: "GitHub", segment: "integrations/github", icon: GitBranch },
    ],
  },
  {
    label: "Proyecto",
    items: [
      { label: "Kit de marca", segment: "brand-kit", icon: Palette },
      { label: "Analíticas", segment: "analytics", icon: BarChart3 },
      { label: "Configuración", segment: "settings", icon: Settings },
    ],
  },
];

export const workspaceNavItems: NavItem[] = [
  { label: "Proyectos", segment: "/dashboard", icon: FolderKanban },
  { label: "Analíticas globales", segment: "/dashboard/analytics", icon: LineChart },
];

export const adminNavItems: NavItem[] = [{ label: "Panel administrativo", segment: "/admin", icon: ShieldCheck }];

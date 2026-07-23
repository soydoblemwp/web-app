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
  ClipboardCheck,
  Sparkles,
  Repeat,
  Bell,
  Download,
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

export interface GuestNavItem {
  label: string;
  icon: LucideIcon;
  /** Present only for tools actually usable without an account. */
  href?: string;
  /** True for modules that need an account — rendered via AccountGateNavItem instead of a link. */
  restricted?: boolean;
}

export interface GuestNavGroup {
  label: string;
  items: GuestNavItem[];
}

export const guestNavGroups: GuestNavGroup[] = [
  {
    label: "Disponibles sin cuenta",
    items: [
      { label: "Generador de contenido", href: "/guest/content", icon: FileText },
      { label: "Herramientas SEO", href: "/guest/seo", icon: Search },
      { label: "Analizador de publicaciones", href: "/guest/analyzer", icon: ClipboardCheck },
      { label: "Ideas para redes sociales", href: "/guest/ideas", icon: Sparkles },
      { label: "Adaptador de contenido", href: "/guest/adapter", icon: Repeat },
      { label: "Generador de respuestas", href: "/guest/replies", icon: MessageSquareReply },
    ],
  },
  {
    label: "Requieren una cuenta",
    items: [
      { label: "Proyectos permanentes", icon: FolderKanban, restricted: true },
      { label: "Historial sincronizado", icon: LineChart, restricted: true },
      { label: "Biblioteca permanente", icon: Library, restricted: true },
      { label: "Campañas guardadas", icon: Megaphone, restricted: true },
      { label: "Calendario permanente", icon: CalendarDays, restricted: true },
      { label: "Automatizaciones", icon: Workflow, restricted: true },
      { label: "Monitoreo", icon: Radar, restricted: true },
      { label: "Integración WordPress", icon: Globe, restricted: true },
      { label: "Integración GitHub", icon: GitBranch, restricted: true },
      { label: "Colaboraciones", icon: Handshake, restricted: true },
      { label: "Notificaciones persistentes", icon: Bell, restricted: true },
      { label: "Configuración de marca", icon: Palette, restricted: true },
      { label: "Administración", icon: ShieldCheck, restricted: true },
      { label: "Exportar o eliminar datos", icon: Download, restricted: true },
    ],
  },
];

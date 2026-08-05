"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Inbox, CalendarDays, ListOrdered, CheckSquare, Image as ImageIcon, BarChart3, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { platformLabel, COMPOSER_PLATFORM_VALUES } from "@/lib/publishing/platform-specs";
import { EDITORIAL_STATUS_VALUES, STATUS_LABELS } from "@/lib/publishing/status";
import { InboxView } from "@/components/publishing/views/inbox-view";
import { CalendarView } from "@/components/publishing/views/calendar-view";
import { QueueView } from "@/components/publishing/views/queue-view";
import { ApprovalsView } from "@/components/publishing/views/approvals-view";
import { LibraryView } from "@/components/publishing/views/library-view";
import { PerformanceView } from "@/components/publishing/views/performance-view";
import type { PublicationData, ProjectMemberData } from "@/components/publishing/types";

const VIEWS = [
  { id: "inbox", label: "Bandeja", icon: Inbox },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "queue", label: "Cola", icon: ListOrdered },
  { id: "approvals", label: "Aprobaciones", icon: CheckSquare },
  { id: "library", label: "Biblioteca", icon: ImageIcon },
  { id: "performance", label: "Rendimiento", icon: BarChart3 },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const VIEW_KEY = "ai-content-hub:publishing-hub-view";
const noopSubscribe = () => () => {};
function useHasMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
function readView(): ViewId {
  if (typeof window === "undefined") return "inbox";
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    return (VIEWS.some((v) => v.id === raw) ? raw : "inbox") as ViewId;
  } catch {
    return "inbox";
  }
}

export function PublishingHub({
  projectId,
  publications,
  members,
  currentUserId,
}: {
  projectId: string;
  publications: PublicationData[];
  members: ProjectMemberData[];
  currentUserId: string;
}) {
  const hasMounted = useHasMounted();
  const [viewOverride, setViewOverride] = useState<ViewId | null>(null);
  const view = viewOverride ?? (hasMounted ? readView() : "inbox");
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [now] = useState(() => Date.now());

  function setView(next: ViewId) {
    setViewOverride(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // private browsing — view choice just won't persist.
    }
  }

  const filtered = useMemo(
    () =>
      publications.filter((p) => {
        if (search && !(p.internalTitle ?? "").toLowerCase().includes(search.toLowerCase()) && !p.text.toLowerCase().includes(search.toLowerCase())) return false;
        if (platformFilter !== "ALL" && p.platform !== platformFilter) return false;
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        return true;
      }),
    [publications, search, platformFilter, statusFilter]
  );

  const upcoming = filtered.filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() >= now && p.status !== "PUBLISHED").length;
  const overdue = filtered.filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() < now && !["PUBLISHED", "CANCELLED", "ARCHIVED"].includes(p.status)).length;
  const failed = filtered.filter((p) => p.status === "FAILED").length;
  const pendingApproval = filtered.filter((p) => p.status === "IN_REVIEW").length;
  const recentActivity = filtered.filter((p) => now - new Date(p.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 7).length;

  const ActiveView = view;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Próximas" value={upcoming} />
        <SummaryCard label="Atrasadas" value={overdue} tone={overdue > 0 ? "destructive" : undefined} />
        <SummaryCard label="Con errores" value={failed} tone={failed > 0 ? "destructive" : undefined} />
        <SummaryCard label="Esperando aprobación" value={pendingApproval} />
        <SummaryCard label="Actividad (7 días)" value={recentActivity} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          {VIEWS.map((v) => (
            <Button key={v.id} type="button" variant={view === v.id ? "secondary" : "ghost"} size="sm" onClick={() => setView(v.id)}>
              <v.icon className="size-3.5" /> {v.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar publicaciones..." className="pl-8" />
        </div>
        <Select value={platformFilter} onValueChange={(v) => v && setPlatformFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Plataforma: todas</SelectItem>
            {COMPOSER_PLATFORM_VALUES.map((p) => (
              <SelectItem key={p} value={p}>
                {platformLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Estado: todos</SelectItem>
            {EDITORIAL_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ActiveView === "inbox" ? <InboxView projectId={projectId} publications={filtered} currentUserId={currentUserId} /> : null}
      {ActiveView === "calendar" ? <CalendarView projectId={projectId} publications={filtered} members={members} /> : null}
      {ActiveView === "queue" ? <QueueView projectId={projectId} publications={filtered} /> : null}
      {ActiveView === "approvals" ? <ApprovalsView projectId={projectId} publications={filtered} /> : null}
      {ActiveView === "library" ? <LibraryView projectId={projectId} /> : null}
      {ActiveView === "performance" ? <PerformanceView projectId={projectId} publications={filtered} /> : null}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "destructive" }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-xl font-semibold", tone === "destructive" && value > 0 && "text-destructive")}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function PublicationLink({ projectId, postId, children }: { projectId: string; postId: string; children: React.ReactNode }) {
  return <Link href={`/dashboard/${projectId}/publishing/${postId}`}>{children}</Link>;
}

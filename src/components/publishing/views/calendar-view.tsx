"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { moveScheduledDateAction } from "@/server/actions/publishing";
import { findSchedulingConflicts } from "@/lib/publishing/scheduling";
import { platformLabel } from "@/lib/publishing/platform-specs";
import { CAMPAIGN_PIECE_PRIORITY_LABELS } from "@/lib/campaign-studio/piece-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PublicationData, ProjectMemberData } from "@/components/publishing/types";

type ViewMode = "month" | "week" | "agenda";

export function CalendarView({ projectId, publications, members }: { projectId: string; publications: PublicationData[]; members: ProjectMemberData[] }) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [reference, setReference] = useState(new Date());
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [approverFilter, setApproverFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      publications.filter((p) => {
        if (assigneeFilter !== "ALL" && p.assigneeId !== assigneeFilter) return false;
        if (approverFilter !== "ALL" && p.approverId !== approverFilter) return false;
        if (priorityFilter !== "ALL" && p.priority !== priorityFilter) return false;
        return true;
      }),
    [publications, assigneeFilter, approverFilter, priorityFilter]
  );

  const scheduled = filtered.filter((p) => p.scheduledAt);
  const unscheduled = filtered.filter((p) => !p.scheduledAt);

  const conflicts = useMemo(() => {
    const conflictIds = new Set<string>();
    for (const post of scheduled) {
      const found = findSchedulingConflicts(
        { platform: post.platform, scheduledAt: new Date(post.scheduledAt!), excludeId: post.id },
        scheduled.map((p) => ({ id: p.id, platform: p.platform, scheduledAt: new Date(p.scheduledAt!) }))
      );
      if (found.length > 0) conflictIds.add(post.id);
    }
    return conflictIds;
  }, [scheduled]);

  const days = useMemo(() => {
    if (view === "week") {
      return eachDayOfInterval({ start: startOfWeek(reference, { weekStartsOn: 1 }), end: endOfWeek(reference, { weekStartsOn: 1 }) });
    }
    const gridStart = startOfWeek(startOfMonth(reference), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(reference), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [reference, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, PublicationData[]>();
    for (const post of scheduled) {
      const key = format(new Date(post.scheduledAt!), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    return map;
  }, [scheduled]);

  async function moveTo(dateKey: string) {
    if (!draggedId) return;
    const post = publications.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!post) return;
    const time = post.scheduledAt ? post.scheduledAt.slice(11, 16) : "09:00";
    const result = await moveScheduledDateAction(projectId, post.id, { scheduledAt: `${dateKey}T${time}:00.000Z` });
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" onClick={() => setReference((d) => (view === "week" ? subWeeks(d, 1) : subMonths(d, 1)))}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="w-44 text-center text-sm font-medium capitalize">{format(reference, view === "week" ? "'Semana del' d 'de' MMMM" : "MMMM yyyy", { locale: es })}</p>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => setReference((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex gap-1">
          {(["month", "week", "agenda"] as const).map((v) => (
            <Button key={v} type="button" variant={view === v ? "secondary" : "ghost"} size="sm" onClick={() => setView(v)}>
              {v === "month" ? "Mes" : v === "week" ? "Semana" : "Agenda"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Responsable: todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={approverFilter} onValueChange={(v) => v && setApproverFilter(v)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Aprobador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Aprobador: todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Prioridad: todas</SelectItem>
            {Object.entries(CAMPAIGN_PIECE_PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {view === "agenda" ? (
        <div className="space-y-1.5">
          {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => (
            <div key={day} className="rounded-md border p-2.5">
              <p className="mb-1 text-xs font-semibold capitalize">{format(new Date(day), "EEEE d 'de' MMMM", { locale: es })}</p>
              {items.map((post) => (
                <PublicationChip key={post.id} projectId={projectId} post={post} hasConflict={conflicts.has(post.id)} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveTo(key)}
                className={cn(
                  "min-h-24 rounded-md border p-1.5 text-xs",
                  !isSameMonth(day, reference) && view === "month" && "bg-muted/20 text-muted-foreground",
                  isToday(day) && "border-primary"
                )}
              >
                <p className="mb-1 font-medium">{format(day, "d")}</p>
                <div className="space-y-1">
                  {items.map((post) => (
                    <div key={post.id} draggable onDragStart={() => setDraggedId(post.id)}>
                      <PublicationChip projectId={projectId} post={post} hasConflict={conflicts.has(post.id)} compact />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unscheduled.length > 0 ? (
        <div className="rounded-lg border p-3">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Sin programar ({unscheduled.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((post) => (
              <PublicationChip key={post.id} projectId={projectId} post={post} hasConflict={false} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PublicationChip({ projectId, post, hasConflict, compact }: { projectId: string; post: PublicationData; hasConflict: boolean; compact?: boolean }) {
  return (
    <Link
      href={`/dashboard/${projectId}/publishing/${post.id}`}
      className={cn(
        "flex items-center gap-1 truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20",
        compact ? "block" : "inline-flex"
      )}
      title={post.internalTitle ?? undefined}
    >
      {hasConflict ? <AlertTriangle className="size-3 shrink-0 text-amber-600" /> : null}
      <span className="truncate">{post.internalTitle || platformLabel(post.platform)}</span>
      {!compact ? <Badge variant="outline" className="text-[9px]">{platformLabel(post.platform)}</Badge> : null}
    </Link>
  );
}

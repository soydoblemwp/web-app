"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { updateCampaignPieceAction } from "@/server/actions/campaign-pieces";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS } from "@/lib/campaign-studio/piece-status";
import { campaignChannelLabel, CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CampaignDetailData, CampaignPieceData, CampaignPillarData, ProjectMemberData } from "@/components/campaign-studio/types";

type CalendarView = "month" | "week" | "agenda";

export function CalendarTab({
  projectId,
  campaign,
  pillars,
  pieces,
  members,
  onPiecesChange,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  pillars: CampaignPillarData[];
  pieces: CampaignPieceData[];
  members: ProjectMemberData[];
  onPiecesChange: (pieces: CampaignPieceData[]) => void;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [reference, setReference] = useState(new Date());
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [pillarFilter, setPillarFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      pieces.filter((p) => {
        if (channelFilter !== "ALL" && p.platform !== channelFilter) return false;
        if (pillarFilter !== "ALL" && p.pillarId !== pillarFilter) return false;
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        if (assigneeFilter !== "ALL" && p.assigneeId !== assigneeFilter) return false;
        return true;
      }),
    [pieces, channelFilter, pillarFilter, statusFilter, assigneeFilter]
  );

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(reference, { weekStartsOn: 1 });
      const end = endOfWeek(reference, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    const monthStart = startOfMonth(reference);
    const monthEnd = endOfMonth(reference);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [reference, view]);

  const piecesByDay = useMemo(() => {
    const map = new Map<string, CampaignPieceData[]>();
    for (const piece of filtered) {
      if (!piece.scheduledDate) continue;
      const key = format(new Date(piece.scheduledDate), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), piece]);
    }
    return map;
  }, [filtered]);

  async function moveTo(dateKey: string) {
    if (!draggedId) return;
    const piece = pieces.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!piece) return;

    const previous = pieces;
    const optimistic = pieces.map((p) => (p.id === piece.id ? { ...p, scheduledDate: `${dateKey}T00:00:00.000Z` } : p));
    onPiecesChange(optimistic);

    const result = await updateCampaignPieceAction(projectId, campaign.id, { id: piece.id, scheduledDate: dateKey });
    if (result.error) {
      onPiecesChange(previous);
      toast.error(`No se pudo mover la fecha: ${result.error}`);
    }
  }

  const step = view === "week" ? 1 : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" onClick={() => setReference((d) => (view === "week" ? subWeeks(d, step) : subMonths(d, step)))}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="w-40 text-center text-sm font-medium capitalize">{format(reference, view === "week" ? "'Semana del' d 'de' MMMM" : "MMMM yyyy", { locale: es })}</p>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => setReference((d) => (view === "week" ? addWeeks(d, step) : addMonths(d, step)))}>
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
        <Select value={channelFilter} onValueChange={(v) => v && setChannelFilter(v)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Canal: todos</SelectItem>
            {CAMPAIGN_CHANNELS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Estado: todos</SelectItem>
            {CAMPAIGN_PIECE_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {CAMPAIGN_PIECE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pillarFilter} onValueChange={(v) => v && setPillarFilter(v)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Pilar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Pilar: todos</SelectItem>
            {pillars.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
          <SelectTrigger size="sm" className="w-36">
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
      </div>

      {view === "agenda" ? (
        <div className="space-y-1.5">
          {[...piecesByDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, dayPieces]) => (
              <div key={day} className="rounded-md border p-2.5">
                <p className="mb-1 text-xs font-semibold">{format(new Date(day), "EEEE d 'de' MMMM", { locale: es })}</p>
                <div className="space-y-1">
                  {dayPieces.map((piece) => (
                    <div key={piece.id} className="flex items-center justify-between text-xs">
                      <span>{piece.title}</span>
                      <Badge variant="outline">{campaignChannelLabel(piece.platform)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          {piecesByDay.size === 0 ? <p className="text-sm text-muted-foreground">No hay piezas programadas.</p> : null}
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
            const dayPieces = piecesByDay.get(key) ?? [];
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
                  {dayPieces.map((piece) => (
                    <div
                      key={piece.id}
                      draggable
                      onDragStart={() => setDraggedId(piece.id)}
                      className="cursor-grab truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                      title={piece.title}
                    >
                      {piece.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

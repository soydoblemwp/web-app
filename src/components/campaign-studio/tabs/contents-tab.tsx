"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, List, Table as TableIcon, Sparkles, Loader2, Plus, Search } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { buildCampaignPlanSystemPrompt, buildCampaignPlanUserPrompt, parseCampaignPlanText } from "@/lib/campaign-studio/plan-ai";
import { createCampaignPiecesFromDraftsAction, createCampaignPieceAction } from "@/server/actions/campaign-pieces";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS, CAMPAIGN_PIECE_PRIORITY_VALUES, CAMPAIGN_PIECE_PRIORITY_LABELS } from "@/lib/campaign-studio/piece-status";
import { campaignChannelLabel, CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import { KanbanBoard } from "@/components/campaign-studio/kanban-board";
import { BatchActionBar } from "@/components/campaign-studio/batch-action-bar";
import { PieceDetailSheet } from "@/components/campaign-studio/piece-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignDetailData, CampaignPieceData, CampaignPillarData, ProjectMemberData } from "@/components/campaign-studio/types";

type ViewMode = "table" | "kanban" | "list";

export function ContentsTab({
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
  const router = useRouter();
  const ai = useLocalAI();
  const [view, setView] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [pillarFilter, setPillarFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openPieceId, setOpenPieceId] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const busy = ai.status === "loading" || ai.status === "generating";

  const filtered = useMemo(() => {
    return pieces.filter((p) => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (platformFilter !== "ALL" && p.platform !== platformFilter) return false;
      if (pillarFilter !== "ALL" && p.pillarId !== pillarFilter) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (priorityFilter !== "ALL" && p.priority !== priorityFilter) return false;
      if (assigneeFilter !== "ALL" && p.assigneeId !== assigneeFilter) return false;
      return true;
    });
  }, [pieces, search, platformFilter, pillarFilter, statusFilter, priorityFilter, assigneeFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleGeneratePlan() {
    if (!campaign.startDate || !campaign.endDate) {
      toast.error("Define fecha inicial y final en el asistente antes de generar el plan.");
      return;
    }
    setGeneratingPlan(true);
    const system = buildCampaignPlanSystemPrompt("");
    const prompt = buildCampaignPlanUserPrompt({
      campaignName: campaign.name,
      objective: campaign.objective ?? "",
      audience: campaign.audience ?? "",
      channels: campaign.channels,
      pillarNames: pillars.map((p) => p.name),
      contentCount: campaign.contentCount ?? 8,
      startDate: campaign.startDate.slice(0, 10),
      endDate: campaign.endDate.slice(0, 10),
    });
    const result = await ai.generate({ system, prompt, maxTokens: 3000 });
    setGeneratingPlan(false);
    if (!result) return;
    const drafts = parseCampaignPlanText(result);
    if (drafts.length === 0) {
      toast.error("No se pudo generar el plan. Inténtalo de nuevo.");
      return;
    }
    const saveResult = await createCampaignPiecesFromDraftsAction(projectId, campaign.id, drafts);
    if (saveResult.error) {
      toast.error(saveResult.error);
      return;
    }
    toast.success(`${saveResult.created} piezas generadas.`);
    router.refresh();
  }

  async function handleAddPiece() {
    const result = await createCampaignPieceAction(projectId, campaign.id, {
      title: "Nueva pieza",
      platform: campaign.channels[0] ?? CAMPAIGN_CHANNELS[0].id,
    });
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  const openPiece = pieces.find((p) => p.id === openPieceId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleGeneratePlan} disabled={busy || generatingPlan}>
            {generatingPlan ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generar plan con IA
          </Button>
          <Button type="button" variant="outline" onClick={handleAddPiece}>
            <Plus className="size-4" /> Añadir pieza
          </Button>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant={view === "kanban" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("kanban")} aria-label="Kanban">
            <LayoutGrid className="size-4" />
          </Button>
          <Button type="button" variant={view === "table" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("table")} aria-label="Tabla">
            <TableIcon className="size-4" />
          </Button>
          <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("list")} aria-label="Lista">
            <List className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar piezas..." className="w-48 pl-8" />
        </div>
        <FilterSelect label="Plataforma" value={platformFilter} onChange={setPlatformFilter} options={CAMPAIGN_CHANNELS.map((c) => ({ value: c.id, label: c.label }))} />
        <FilterSelect label="Pilar" value={pillarFilter} onChange={setPillarFilter} options={pillars.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Estado" value={statusFilter} onChange={setStatusFilter} options={CAMPAIGN_PIECE_STATUS_VALUES.map((s) => ({ value: s, label: CAMPAIGN_PIECE_STATUS_LABELS[s] }))} />
        <FilterSelect label="Prioridad" value={priorityFilter} onChange={setPriorityFilter} options={CAMPAIGN_PIECE_PRIORITY_VALUES.map((p) => ({ value: p, label: CAMPAIGN_PIECE_PRIORITY_LABELS[p] }))} />
        <FilterSelect label="Responsable" value={assigneeFilter} onChange={setAssigneeFilter} options={members.map((m) => ({ value: m.id, label: m.name || m.email }))} />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {pieces.length === 0
              ? "Todavía no hay piezas planificadas. Genera un plan con IA o añade una manualmente."
              : "Ningún resultado con estos filtros."}
          </CardContent>
        </Card>
      ) : view === "kanban" ? (
        <KanbanBoard
          projectId={projectId}
          campaignId={campaign.id}
          pieces={filtered}
          onPiecesChange={(next) => {
            const ids = new Set(next.map((p) => p.id));
            onPiecesChange([...pieces.filter((p) => !ids.has(p.id)), ...next]);
          }}
          onOpenPiece={(piece) => setOpenPieceId(piece.id)}
        />
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2 text-left">Título</th>
                <th className="p-2 text-left">Plataforma</th>
                <th className="p-2 text-left">Estado</th>
                <th className="p-2 text-left">Prioridad</th>
                <th className="p-2 text-left">Responsable</th>
                <th className="p-2 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((piece) => (
                <tr key={piece.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpenPieceId(piece.id)}>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.includes(piece.id)} onCheckedChange={() => toggleSelected(piece.id)} />
                  </td>
                  <td className="p-2 font-medium">{piece.title}</td>
                  <td className="p-2">{campaignChannelLabel(piece.platform)}</td>
                  <td className="p-2">
                    <Badge variant="outline">{CAMPAIGN_PIECE_STATUS_LABELS[piece.status as keyof typeof CAMPAIGN_PIECE_STATUS_LABELS]}</Badge>
                  </td>
                  <td className="p-2 text-xs">{CAMPAIGN_PIECE_PRIORITY_LABELS[piece.priority as keyof typeof CAMPAIGN_PIECE_PRIORITY_LABELS]}</td>
                  <td className="p-2 text-xs">{piece.assignee?.name || piece.assignee?.email || "—"}</td>
                  <td className="p-2 text-xs">{piece.scheduledDate ? new Date(piece.scheduledDate).toLocaleDateString("es-ES") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((piece) => (
            <div
              key={piece.id}
              className={cn("flex items-center gap-3 rounded-md border p-2.5 text-sm hover:bg-muted/30", selectedIds.includes(piece.id) && "border-primary")}
            >
              <Checkbox checked={selectedIds.includes(piece.id)} onCheckedChange={() => toggleSelected(piece.id)} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenPieceId(piece.id)}>
                <p className="truncate font-medium">{piece.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {campaignChannelLabel(piece.platform)} · {piece.pillar?.name ?? "Sin pilar"}
                </p>
              </button>
              <Badge variant="outline">{CAMPAIGN_PIECE_STATUS_LABELS[piece.status as keyof typeof CAMPAIGN_PIECE_STATUS_LABELS]}</Badge>
            </div>
          ))}
        </div>
      )}

      <BatchActionBar
        projectId={projectId}
        campaignId={campaign.id}
        pieces={pieces}
        selectedIds={selectedIds}
        members={members}
        onClearSelection={() => setSelectedIds([])}
      />

      <PieceDetailSheet
        projectId={projectId}
        campaign={campaign}
        piece={openPiece}
        pillars={pillars}
        members={members}
        open={openPiece !== null}
        onOpenChange={(open) => !open && setOpenPieceId(null)}
        onSaved={(next) => onPiecesChange(pieces.map((p) => (p.id === next.id ? next : p)))}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{label}: todos</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

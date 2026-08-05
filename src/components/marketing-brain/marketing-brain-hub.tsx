"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutGrid, List as ListIcon, Search, Copy, Archive, X, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  duplicateMarketingBrainRunAction,
  cancelMarketingBrainRunAction,
  archiveMarketingBrainRunAction,
} from "@/server/actions/marketing-brain";
import type { MarketingBrainRunListItem } from "@/components/marketing-brain/types";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Listo",
  RUNNING: "En progreso",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  PARTIALLY_COMPLETED: "Parcialmente completado",
  COMPLETED: "Completado",
  FAILED: "Con errores",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

const STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  DRAFT: "outline",
  READY: "outline",
  RUNNING: "secondary",
  WAITING_FOR_APPROVAL: "secondary",
  PARTIALLY_COMPLETED: "destructive",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
  ARCHIVED: "outline",
};

const VIEW_KEY = "ai-content-hub:marketing-brain-view";
const noopSubscribe = () => () => {};
function useHasMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function runTitle(run: MarketingBrainRunListItem): string {
  return run.campaign?.name || run.briefing.productOrService || run.briefing.objective || run.briefing.description || "Plan sin título";
}

export function MarketingBrainHub({
  projectId,
  runs,
  currentUserId,
  members,
}: {
  projectId: string;
  runs: MarketingBrainRunListItem[];
  currentUserId: string;
  members: { id: string; name: string | null; email: string }[];
}) {
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [viewOverride, setViewOverride] = useState<"cards" | "list" | null>(null);
  const view = viewOverride ?? (hasMounted && typeof window !== "undefined" && window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [campaignFilter, setCampaignFilter] = useState("ALL");
  const [creatorFilter, setCreatorFilter] = useState("ALL");

  function setView(next: "cards" | "list") {
    setViewOverride(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // private browsing — view choice just won't persist.
    }
  }

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of runs) if (run.campaign) map.set(run.campaign.id, run.campaign.name);
    return [...map.entries()];
  }, [runs]);

  const filtered = useMemo(
    () =>
      runs.filter((run) => {
        if (statusFilter !== "ALL" && run.status !== statusFilter) return false;
        if (campaignFilter !== "ALL" && run.campaign?.id !== campaignFilter) return false;
        if (creatorFilter !== "ALL" && run.createdBy.id !== creatorFilter) return false;
        if (search && !runTitle(run).toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [runs, statusFilter, campaignFilter, creatorFilter, search]
  );

  const drafts = filtered.filter((r) => r.status === "DRAFT" || r.status === "READY");
  const inProgress = filtered.filter((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_APPROVAL");
  const failed = filtered.filter((r) => r.status === "FAILED" || r.status === "PARTIALLY_COMPLETED");
  const completed = filtered.filter((r) => r.status === "COMPLETED");

  async function handleDuplicate(id: string) {
    const result = await duplicateMarketingBrainRunAction(projectId, id);
    if (result.error) toast.error(result.error);
    else if (result.id) {
      toast.success("Plan duplicado como nuevo borrador.");
      router.push(`/dashboard/${projectId}/marketing-brain/${result.id}`);
    }
  }

  async function handleCancel(id: string) {
    const result = await cancelMarketingBrainRunAction(projectId, id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Ejecución cancelada.");
      router.refresh();
    }
  }

  async function handleArchive(id: string) {
    const result = await archiveMarketingBrainRunAction(projectId, id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Plan archivado.");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Borradores" value={drafts.length} />
        <SummaryCard label="En progreso" value={inProgress.length} />
        <SummaryCard label="Con errores" value={failed.length} tone={failed.length > 0 ? "destructive" : undefined} />
        <SummaryCard label="Completados" value={completed.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar planes..." className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Estado: todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={(v) => v && setCampaignFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Campaña" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Campaña: todas</SelectItem>
            {campaignOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={creatorFilter} onValueChange={(v) => v && setCreatorFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Creador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Creador: todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id === currentUserId ? "Yo" : m.name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1 rounded-lg border p-1">
          <Button type="button" variant={view === "cards" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("cards")} title="Vista de tarjetas">
            <LayoutGrid className="size-4" />
          </Button>
          <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("list")} title="Vista de lista">
            <ListIcon className="size-4" />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {runs.length === 0 ? "Todavía no has creado ningún plan con AI Marketing Brain." : "No hay planes que coincidan con los filtros."}
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((run) => (
            <RunCard key={run.id} projectId={projectId} run={run} onDuplicate={handleDuplicate} onCancel={handleCancel} onArchive={handleArchive} />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((run) => (
            <RunRow key={run.id} projectId={projectId} run={run} onDuplicate={handleDuplicate} onCancel={handleCancel} onArchive={handleArchive} />
          ))}
        </div>
      )}
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

interface RunActionsProps {
  run: MarketingBrainRunListItem;
  onDuplicate: (id: string) => void;
  onCancel: (id: string) => void;
  onArchive: (id: string) => void;
}

function RunActions({ run, onDuplicate, onCancel, onArchive }: RunActionsProps) {
  const cancellable = !["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"].includes(run.status);
  const archivable = ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status);
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="icon-xs" title="Duplicar" onClick={() => onDuplicate(run.id)}>
        <Copy className="size-3.5" />
      </Button>
      {cancellable ? (
        <Button type="button" variant="ghost" size="icon-xs" title="Cancelar" onClick={() => onCancel(run.id)}>
          <X className="size-3.5" />
        </Button>
      ) : null}
      {archivable ? (
        <Button type="button" variant="ghost" size="icon-xs" title="Archivar" onClick={() => onArchive(run.id)}>
          <Archive className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function RunCard({ projectId, run, onDuplicate, onCancel, onArchive }: { projectId: string } & RunActionsProps) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/dashboard/${projectId}/marketing-brain/${run.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
            {runTitle(run)}
          </Link>
          <Badge variant={STATUS_TONE[run.status]}>{STATUS_LABELS[run.status] ?? run.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {run.createdBy.name || run.createdBy.email} · {new Date(run.createdAt).toLocaleDateString("es-ES")}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${run.progressPercent}%` }} />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Link href={`/dashboard/${projectId}/marketing-brain/${run.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
            {run.status === "DRAFT" ? "Continuar briefing" : "Abrir"} <ArrowRight className="size-3" />
          </Link>
          <RunActions run={run} onDuplicate={onDuplicate} onCancel={onCancel} onArchive={onArchive} />
        </div>
      </CardContent>
    </Card>
  );
}

function RunRow({ projectId, run, onDuplicate, onCancel, onArchive }: { projectId: string } & RunActionsProps) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <Link href={`/dashboard/${projectId}/marketing-brain/${run.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
          {runTitle(run)}
        </Link>
        <Badge variant={STATUS_TONE[run.status]}>{STATUS_LABELS[run.status] ?? run.status}</Badge>
        <span className="text-xs text-muted-foreground">{run.progressPercent}%</span>
        <span className="text-xs text-muted-foreground">{run.createdBy.name || run.createdBy.email}</span>
        <span className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleDateString("es-ES")}</span>
        <RunActions run={run} onDuplicate={onDuplicate} onCancel={onCancel} onArchive={onArchive} />
      </CardContent>
    </Card>
  );
}

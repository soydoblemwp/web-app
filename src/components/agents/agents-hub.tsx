"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star, Users, Sparkles, LayoutGrid, List as ListIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toggleAgentFavoriteAction } from "@/server/actions/agents";
import { NewAgentRunButton } from "@/components/agents/new-agent-run-button";
import { AgentIcon } from "@/components/agents/agent-icon";
import { cn } from "@/lib/utils";
import type { AgentRunListItem, CustomAgentListItem, TeamListItem } from "@/components/agents/types";

interface OfficialAgentSummary {
  key: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  outputType: string;
  active: boolean;
}

const RUN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Listo",
  RUNNING: "En progreso",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  COMPLETED: "Completado",
  PARTIALLY_COMPLETED: "Parcial",
  FAILED: "Con errores",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

export function AgentsHub({
  projectId,
  officialAgents,
  customAgents,
  teams,
  runs,
  favorites,
}: {
  projectId: string;
  officialAgents: OfficialAgentSummary[];
  customAgents: CustomAgentListItem[];
  teams: TeamListItem[];
  runs: AgentRunListItem[];
  favorites: string[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [favoriteRefs, setFavoriteRefs] = useState<Set<string>>(new Set(favorites));

  const categories = useMemo(() => Array.from(new Set(officialAgents.map((a) => a.category))), [officialAgents]);

  const filteredOfficial = officialAgents.filter((a) => {
    if (categoryFilter !== "ALL" && a.category !== categoryFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const favoriteAgents = filteredOfficial.filter((a) => favoriteRefs.has(a.key));

  const inProgress = runs.filter((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_APPROVAL");
  const failed = runs.filter((r) => r.status === "FAILED" || r.status === "PARTIALLY_COMPLETED");
  const recent = runs.slice(0, 8);

  async function handleToggleFavorite(ref: string) {
    setFavoriteRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
    const result = await toggleAgentFavoriteAction(projectId, ref);
    if (!result.favorited) {
      setFavoriteRefs((prev) => {
        const next = new Set(prev);
        next.delete(ref);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="En progreso" value={inProgress.length} />
        <SummaryCard label="Con errores" value={failed.length} tone={failed.length > 0 ? "destructive" : undefined} />
        <SummaryCard label="Agentes personalizados" value={customAgents.length} />
        <SummaryCard label="Equipos" value={teams.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agentes..." className="pl-8" />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Categoría: todas</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1 rounded-lg border p-1">
          <Button type="button" variant={view === "cards" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("cards")} title="Tarjetas">
            <LayoutGrid className="size-4" />
          </Button>
          <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setView("list")} title="Lista">
            <ListIcon className="size-4" />
          </Button>
        </div>
      </div>

      {favoriteAgents.length > 0 ? (
        <Section title="Favoritos" icon={<Star className="size-4" />}>
          <div className={view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1.5"}>
            {favoriteAgents.map((a) => (
              <OfficialAgentCard key={a.key} projectId={projectId} agent={a} favorited onToggleFavorite={() => handleToggleFavorite(a.key)} compact={view === "list"} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Catálogo de agentes" icon={<Sparkles className="size-4" />}>
        {filteredOfficial.length === 0 ? (
          <EmptyState message="No hay agentes que coincidan con los filtros." />
        ) : (
          <div className={view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1.5"}>
            {filteredOfficial.map((a) => (
              <OfficialAgentCard key={a.key} projectId={projectId} agent={a} favorited={favoriteRefs.has(a.key)} onToggleFavorite={() => handleToggleFavorite(a.key)} compact={view === "list"} />
            ))}
          </div>
        )}
      </Section>

      {customAgents.length > 0 ? (
        <Section title="Agentes personalizados" icon={<Sparkles className="size-4" />}>
          <div className={view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1.5"}>
            {customAgents.map((a) => (
              <CustomAgentCard key={a.id} projectId={projectId} agent={a} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Equipos de agentes" icon={<Users className="size-4" />}>
        {teams.length === 0 ? (
          <EmptyState message="Todavía no hay equipos de agentes." />
        ) : (
          <div className={view === "cards" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-1.5"}>
            {teams.map((t) => (
              <TeamCard key={t.id} projectId={projectId} team={t} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Ejecuciones recientes" icon={<Sparkles className="size-4" />}>
        {recent.length === 0 ? (
          <EmptyState message="Todavía no has ejecutado ningún agente." />
        ) : (
          <div className="space-y-1.5">
            {recent.map((run) => (
              <Card key={run.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <Link href={`/dashboard/${projectId}/agents/runs/${run.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {run.customAgent?.name ?? run.team?.name ?? run.officialAgentKey}
                  </Link>
                  <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
                  <span className="text-xs text-muted-foreground">{run.progressPercent}%</span>
                  <span className="text-xs text-muted-foreground">{run.createdBy.name || run.createdBy.email}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon} {title}
      </h2>
      {children}
    </section>
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

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

function OfficialAgentCard({
  projectId,
  agent,
  favorited,
  onToggleFavorite,
  compact,
}: {
  projectId: string;
  agent: OfficialAgentSummary;
  favorited: boolean;
  onToggleFavorite: () => void;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={cn("space-y-2", compact ? "flex flex-wrap items-center gap-3 py-3 space-y-0" : "py-4")}>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/dashboard/${projectId}/agents/${agent.key}`} className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:underline">
            <AgentIcon agentRef={agent.key} className="size-4 shrink-0" />
            <span className="truncate">{agent.name}</span>
          </Link>
          <button type="button" onClick={onToggleFavorite} title="Favorito">
            <Star className={cn("size-4", favorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
          </button>
        </div>
        {!compact ? <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge variant="outline">{agent.category}</Badge>
          <NewAgentRunButton projectId={projectId} officialAgentKey={agent.key} label="Ejecutar" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
}

function CustomAgentCard({ projectId, agent }: { projectId: string; agent: CustomAgentListItem }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <Link href={`/dashboard/${projectId}/agents/${agent.id}`} className="flex items-center gap-2 font-medium hover:underline">
          <AgentIcon agentRef={agent.id} customIconName={agent.icon} className="size-4 shrink-0" />
          <span className="truncate">{agent.name}</span>
        </Link>
        <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge variant="outline">{agent.category}</Badge>
          <NewAgentRunButton projectId={projectId} customAgentId={agent.id} label="Ejecutar" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
}

function TeamCard({ projectId, team }: { projectId: string; team: TeamListItem }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <Link href={`/dashboard/${projectId}/agent-teams/${team.id}`} className="flex items-center gap-2 font-medium hover:underline">
          <Users className="size-4 shrink-0" />
          <span className="truncate">{team.name}</span>
        </Link>
        {team.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{team.description}</p> : null}
        <p className="text-xs text-muted-foreground">{team.members.filter((m) => m.enabled).length} agentes activos</p>
        <NewAgentRunButton projectId={projectId} teamId={team.id} label="Ejecutar equipo" variant="outline" />
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { LayoutGrid, List, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** True only after the client has hydrated — same pattern as editor-sidebar.tsx's useHasMounted, avoids a server/client mismatch on the stored view mode. */
function useHasMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export interface CampaignStudioCardData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  channels: string[];
  brandProfileName: string | null;
  pieceCount: number;
  pillarCount: number;
}

const VIEW_KEY = "ai-content-hub:campaign-studio-view";

function readView(): "grid" | "list" {
  if (typeof window === "undefined") return "grid";
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function CampaignStudioBrowser({ projectId, campaigns }: { projectId: string; campaigns: CampaignStudioCardData[] }) {
  const hasMounted = useHasMounted();
  const [viewOverride, setViewOverride] = useState<"grid" | "list" | null>(null);
  const view = viewOverride ?? (hasMounted ? readView() : "grid");

  function setViewMode(mode: "grid" | "list") {
    setViewOverride(mode);
    try {
      window.localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // private browsing — view choice just won't persist across reloads.
    }
  }

  if (campaigns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Rocket className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">Sin campañas todavía</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crea tu primera campaña con el asistente y deja que la IA proponga estrategia, pilares y plan de contenido.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-1">
        <Button type="button" variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label="Vista de cuadrícula" onClick={() => setViewMode("grid")}>
          <LayoutGrid className="size-4" />
        </Button>
        <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label="Vista de lista" onClick={() => setViewMode("list")}>
          <List className="size-4" />
        </Button>
      </div>

      <div className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2")}>
        {campaigns.map((campaign) => (
          <Link key={campaign.id} href={`/dashboard/${projectId}/campaign-studio/${campaign.id}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader className={cn(view === "list" && "flex-row items-center justify-between space-y-0")}>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </div>
                  {view === "grid" ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.description || "Sin descripción."}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {campaign.channels.slice(0, 4).map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {campaign.pieceCount} piezas · {campaign.pillarCount} pilares
                {campaign.brandProfileName ? ` · ${campaign.brandProfileName}` : ""}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

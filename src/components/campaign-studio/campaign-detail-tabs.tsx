"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SummaryTab } from "@/components/campaign-studio/tabs/summary-tab";
import { StrategyTab } from "@/components/campaign-studio/tabs/strategy-tab";
import { PillarsTab } from "@/components/campaign-studio/tabs/pillars-tab";
import { ContentsTab } from "@/components/campaign-studio/tabs/contents-tab";
import { CalendarTab } from "@/components/campaign-studio/tabs/calendar-tab";
import { TeamTab } from "@/components/campaign-studio/tabs/team-tab";
import { PerformanceTab } from "@/components/campaign-studio/tabs/performance-tab";
import { SettingsTab } from "@/components/campaign-studio/tabs/settings-tab";
import type {
  CampaignDetailData,
  CampaignPieceData,
  CampaignPillarData,
  CampaignStrategyData,
  MetricGoalData,
  ProjectMemberData,
} from "@/components/campaign-studio/types";

type TabId = "summary" | "strategy" | "pillars" | "contents" | "calendar" | "team" | "performance" | "settings";

export function CampaignDetailTabs({
  projectId,
  campaign,
  strategy,
  pillars,
  metricGoals,
  pieces: initialPieces,
  members,
  ownerName,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  strategy: CampaignStrategyData | null;
  pillars: CampaignPillarData[];
  metricGoals: MetricGoalData[];
  pieces: CampaignPieceData[];
  members: ProjectMemberData[];
  ownerName: string;
}) {
  const [tab, setTab] = useState<TabId>("summary");
  const [pieces, setPieces] = useState(initialPieces);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
        {campaign.description ? <p className="text-sm text-muted-foreground">{campaign.description}</p> : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => typeof v === "string" && setTab(v as TabId)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="strategy">Estrategia</TabsTrigger>
          <TabsTrigger value="pillars">Pilares</TabsTrigger>
          <TabsTrigger value="contents">Contenidos</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="team">Equipo</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
          <TabsTrigger value="settings">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-4">
          <SummaryTab projectId={projectId} campaign={campaign} pillars={pillars} pieces={pieces} metricGoals={metricGoals} ownerName={ownerName} />
        </TabsContent>
        <TabsContent value="strategy" className="pt-4">
          <StrategyTab projectId={projectId} campaign={campaign} strategy={strategy} />
        </TabsContent>
        <TabsContent value="pillars" className="pt-4">
          <PillarsTab projectId={projectId} campaign={campaign} pillars={pillars} />
        </TabsContent>
        <TabsContent value="contents" className="pt-4">
          <ContentsTab projectId={projectId} campaign={campaign} pillars={pillars} pieces={pieces} members={members} onPiecesChange={setPieces} />
        </TabsContent>
        <TabsContent value="calendar" className="pt-4">
          <CalendarTab projectId={projectId} campaign={campaign} pillars={pillars} pieces={pieces} members={members} onPiecesChange={setPieces} />
        </TabsContent>
        <TabsContent value="team" className="pt-4">
          <TeamTab members={members} pieces={pieces} />
        </TabsContent>
        <TabsContent value="performance" className="pt-4">
          <PerformanceTab projectId={projectId} campaign={campaign} metricGoals={metricGoals} />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <SettingsTab projectId={projectId} campaign={campaign} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

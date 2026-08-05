"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CAMPAIGN_PIECE_STATUS_LABELS } from "@/lib/campaign-studio/piece-status";
import { cn } from "@/lib/utils";
import type { CampaignPieceData, ProjectMemberData } from "@/components/campaign-studio/types";

export function TeamTab({ members, pieces }: { members: ProjectMemberData[]; pieces: CampaignPieceData[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const assignedPieces = selectedId ? pieces.filter((p) => p.assigneeId === selectedId) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 lg:col-span-1">
        {members.map((member) => {
          const count = pieces.filter((p) => p.assigneeId === member.id).length;
          return (
            <Card
              key={member.id}
              className={cn("cursor-pointer transition-colors hover:border-primary/50", selectedId === member.id && "border-primary")}
              onClick={() => setSelectedId((prev) => (prev === member.id ? null : member.id))}
            >
              <CardContent className="flex items-center gap-3 py-3">
                <Avatar>
                  <AvatarImage src={member.image ?? undefined} />
                  <AvatarFallback>{(member.name ?? member.email)[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name || member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
                <Badge variant="outline">{count}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="lg:col-span-2">
        {selectedId ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Piezas asignadas</p>
            {assignedPieces.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin piezas asignadas.</p>
            ) : (
              assignedPieces.map((piece) => (
                <div key={piece.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span className="truncate">{piece.title}</span>
                  <Badge variant="outline">{CAMPAIGN_PIECE_STATUS_LABELS[piece.status as keyof typeof CAMPAIGN_PIECE_STATUS_LABELS]}</Badge>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Selecciona un miembro para ver sus piezas asignadas.</p>
        )}
      </div>
    </div>
  );
}

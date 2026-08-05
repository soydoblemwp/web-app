"use client";

import { useState } from "react";
import { toast } from "sonner";
import { moveCampaignPieceAction } from "@/server/actions/campaign-pieces";
import { CAMPAIGN_PIECE_STATUS_VALUES, CAMPAIGN_PIECE_STATUS_LABELS } from "@/lib/campaign-studio/piece-status";
import { campaignChannelLabel } from "@/lib/campaign-studio/channels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CampaignPieceStatus } from "@/generated/prisma/enums";
import type { CampaignPieceData } from "@/components/campaign-studio/types";
import { cn } from "@/lib/utils";

/**
 * A real drag-and-drop Kanban board — native HTML5 drag events (no library,
 * matches "no instales librería pesada / no WebSockets" — see spec section
 * 9). Optimistic: the card moves in the UI immediately on drop; if the
 * server call fails, the local move is rolled back and the user is told.
 */
export function KanbanBoard({
  projectId,
  campaignId,
  pieces,
  onPiecesChange,
  onOpenPiece,
}: {
  projectId: string;
  campaignId: string;
  pieces: CampaignPieceData[];
  onPiecesChange: (pieces: CampaignPieceData[]) => void;
  onOpenPiece: (piece: CampaignPieceData) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<CampaignPieceStatus | null>(null);

  async function handleDrop(status: CampaignPieceStatus) {
    setDragOverStatus(null);
    if (!draggedId) return;
    const piece = pieces.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!piece || piece.status === status) return;

    const columnPieces = pieces.filter((p) => p.status === status);
    const newOrder = columnPieces.length;
    const previous = pieces;
    const optimistic = pieces.map((p) => (p.id === piece.id ? { ...p, status, order: newOrder } : p));
    onPiecesChange(optimistic);

    const result = await moveCampaignPieceAction(projectId, campaignId, piece.id, { status, order: newOrder });
    if (result.error) {
      onPiecesChange(previous);
      toast.error(`No se pudo mover la pieza: ${result.error}`);
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {CAMPAIGN_PIECE_STATUS_VALUES.map((status) => {
        const columnPieces = pieces.filter((p) => p.status === status).sort((a, b) => a.order - b.order);
        return (
          <div
            key={status}
            className={cn(
              "w-64 shrink-0 rounded-lg border bg-muted/20 p-2",
              dragOverStatus === status && "border-primary bg-primary/5"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((prev) => (prev === status ? null : prev))}
            onDrop={() => handleDrop(status)}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold">{CAMPAIGN_PIECE_STATUS_LABELS[status]}</p>
              <Badge variant="outline" className="text-[10px]">
                {columnPieces.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {columnPieces.map((piece) => (
                <Card
                  key={piece.id}
                  draggable
                  onDragStart={() => setDraggedId(piece.id)}
                  onClick={() => onOpenPiece(piece)}
                  className="cursor-grab p-0 transition-shadow hover:shadow-md"
                >
                  <CardContent className="space-y-1.5 p-2.5">
                    <p className="text-sm leading-snug font-medium">{piece.title}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {campaignChannelLabel(piece.platform)}
                      </Badge>
                      {piece.pillar ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: piece.pillar.color ?? "var(--muted-foreground)" }} />
                          {piece.pillar.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {piece.scheduledDate ? new Date(piece.scheduledDate).toLocaleDateString("es-ES") : "Sin fecha"}
                      </span>
                      {piece.assignee ? (
                        <Avatar className="size-5">
                          <AvatarImage src={piece.assignee.image ?? undefined} />
                          <AvatarFallback className="text-[9px]">{(piece.assignee.name ?? piece.assignee.email)[0]}</AvatarFallback>
                        </Avatar>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

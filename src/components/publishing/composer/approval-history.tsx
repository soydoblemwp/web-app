"use client";

import { useEffect, useState } from "react";
import { getApprovalHistoryAction } from "@/server/actions/publishing-approval-read";
import { CheckCircle2, RotateCcw, Send, XCircle, MessageSquare } from "lucide-react";

const ACTION_ICON: Record<string, typeof CheckCircle2> = {
  SUBMITTED: Send,
  APPROVED: CheckCircle2,
  CHANGES_REQUESTED: RotateCcw,
  COMMENTED: MessageSquare,
  CANCELLED: XCircle,
};

const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Enviado a revisión",
  APPROVED: "Aprobado",
  CHANGES_REQUESTED: "Cambios solicitados",
  COMMENTED: "Comentario",
  CANCELLED: "Cancelado",
};

export function ApprovalHistory({ postId }: { postId: string }) {
  const [events, setEvents] = useState<
    { id: string; action: string; comment: string | null; createdAt: string; actor: { name: string | null; email: string } }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    getApprovalHistoryAction(postId).then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (events.length === 0) return <p className="text-xs text-muted-foreground">Sin decisiones registradas todavía.</p>;

  return (
    <ul className="space-y-1.5">
      {events.map((event) => {
        const Icon = ACTION_ICON[event.action] ?? MessageSquare;
        return (
          <li key={event.id} className="flex items-start gap-1.5 text-xs">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div>
              <span className="font-medium">{event.actor.name || event.actor.email}</span> — {ACTION_LABEL[event.action] ?? event.action}
              {event.comment ? <p className="text-muted-foreground">{event.comment}</p> : null}
              <p className="text-[10px] text-muted-foreground">{new Date(event.createdAt).toLocaleString("es-ES")}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

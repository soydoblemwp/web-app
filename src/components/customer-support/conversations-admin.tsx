"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/components/automations/labels";
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONE, RESPONSE_TYPE_LABELS, EVIDENCE_LABELS, EVIDENCE_TONE } from "@/components/customer-support/labels";
import { getConversationDetailAction } from "@/server/actions/customer-support";

interface ConversationRow {
  id: string;
  publicId: string;
  status: string;
  language: string;
  category: string | null;
  originPage: string | null;
  lastResponseType: string | null;
  lastEvidence: string | null;
  escalated: boolean;
  messageCount: number;
  startedAt: string;
}

interface MessageDetail {
  id: string;
  role: string;
  content: string;
  responseType: string | null;
  evidence: string | null;
  feedback: string;
  createdAt: string;
}

export function ConversationsAdmin({ projectId, initialConversations }: { projectId: string; initialConversations: ConversationRow[] }) {
  const [conversations] = useState(initialConversations);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<{ id: string; messages: MessageDetail[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = conversations.filter((c) => !statusFilter || c.status === statusFilter);

  async function openDetail(id: string) {
    setLoadingDetail(true);
    const result = await getConversationDetailAction(projectId, id);
    setLoadingDetail(false);
    if ("error" in result) return;
    setSelected({
      id,
      messages: result.conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        responseType: m.responseType,
        evidence: m.evidence,
        feedback: m.feedback,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border bg-background px-2 text-sm">
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activa</option>
          <option value="RESOLVED">Resuelta</option>
          <option value="ESCALATED">Escalada</option>
          <option value="CLOSED">Cerrada</option>
        </select>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay conversaciones reales todavia.</p>
          ) : (
            filtered.map((c) => (
              <button key={c.id} onClick={() => openDetail(c.id)} className="flex w-full flex-wrap items-center gap-2 rounded-md border p-3 text-left text-sm hover:bg-accent">
                <Badge variant={CONVERSATION_STATUS_TONE[c.status] ?? "outline"}>{CONVERSATION_STATUS_LABELS[c.status] ?? c.status}</Badge>
                {c.lastResponseType ? <span className="text-xs text-muted-foreground">{RESPONSE_TYPE_LABELS[c.lastResponseType] ?? c.lastResponseType}</span> : null}
                {c.lastEvidence ? <Badge variant={EVIDENCE_TONE[c.lastEvidence] ?? "outline"}>{EVIDENCE_LABELS[c.lastEvidence] ?? c.lastEvidence}</Badge> : null}
                {c.escalated ? <Badge variant="destructive">Escalada</Badge> : null}
                <span className="text-xs text-muted-foreground">{c.originPage}</span>
                <span className="text-xs text-muted-foreground">{c.messageCount} mensajes</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(c.startedAt)}</span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Detalle de la conversacion</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingDetail ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : (
              selected.messages.map((m) => (
                <div key={m.id} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                    {m.responseType ? <span className="text-xs text-muted-foreground">{RESPONSE_TYPE_LABELS[m.responseType] ?? m.responseType}</span> : null}
                    {m.evidence ? <Badge variant={EVIDENCE_TONE[m.evidence] ?? "outline"}>{EVIDENCE_LABELS[m.evidence] ?? m.evidence}</Badge> : null}
                    {m.feedback !== "NONE" ? <Badge variant={m.feedback === "POSITIVE" ? "secondary" : "destructive"}>{m.feedback}</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

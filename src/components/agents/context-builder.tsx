"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { listContentItemsForSelectAction } from "@/server/actions/publishing-select";
import { listCollectionsForSelectAction } from "@/server/actions/knowledge-select";
import type { AgentContextSelection } from "@/lib/agents/types";

/**
 * Universal context selection (spec section 14) — separate from an agent's
 * own required/optional input fields: this is the cross-agent "attach
 * project context" panel every run gets, regardless of which agent it
 * targets.
 */
export function ContextBuilder({
  projectId,
  context,
  onChange,
}: {
  projectId: string;
  context: AgentContextSelection;
  onChange: (next: Partial<AgentContextSelection>) => void;
}) {
  const [contentItems, setContentItems] = useState<{ id: string; title: string }[] | null>(null);
  const [knowledgeCollections, setKnowledgeCollections] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listContentItemsForSelectAction(projectId).then((items) => {
      if (!cancelled) setContentItems(items);
    });
    listCollectionsForSelectAction(projectId).then((cols) => {
      if (!cancelled) setKnowledgeCollections(cols);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedIds = context.contentItemIds ?? [];
  const selectedKnowledgeCollectionIds = context.knowledgeCollectionIds ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-xs font-medium text-muted-foreground">Contexto del proyecto (opcional)</p>
        {contentItems && contentItems.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Contenido existente</Label>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {contentItems.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label key={item.id} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onChange({ contentItemIds: checked ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id] })}
                    />
                    {item.title}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        {knowledgeCollections && knowledgeCollections.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Colecciones de Knowledge Base</Label>
            <p className="text-[11px] text-muted-foreground">El agente solo recibirá fragmentos de las colecciones que marques aquí — nunca acceso implícito a todas.</p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {knowledgeCollections.map((col) => {
                const checked = selectedKnowledgeCollectionIds.includes(col.id);
                return (
                  <label key={col.id} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        onChange({ knowledgeCollectionIds: checked ? selectedKnowledgeCollectionIds.filter((id) => id !== col.id) : [...selectedKnowledgeCollectionIds, col.id] })
                      }
                    />
                    {col.name}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="context-notes">
            Notas adicionales
          </Label>
          <Textarea
            id="context-notes"
            rows={3}
            value={context.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Cualquier información adicional relevante para el agente."
          />
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Send, Layers, BookmarkPlus, ExternalLink } from "lucide-react";
import {
  saveAgentResultAsContentItemAction,
  saveAgentResultAsCampaignPillarsAction,
  saveAgentResultAsSocialPostsAction,
  saveAgentResultAsPromptAction,
} from "@/server/actions/agent-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { AgentRunStepData } from "@/components/agents/types";

/** Which "save as X" actions make sense for a given agent's output — never all actions for every type (spec section 17: "no todas las acciones deben aparecer para todos los tipos"). */
function compatibleActions(agentRef: string, output: AgentRunStepData["output"]): { contentItem: boolean; pillars: boolean; socialPosts: boolean } {
  const isArray = Array.isArray(output);
  return {
    contentItem: !isArray && ["writing-agent", "brand-agent", "research-agent", "marketing-agent"].includes(agentRef),
    pillars: isArray && agentRef === "campaign-agent",
    socialPosts: (isArray || !isArray) && ["social-media-agent", "content-repurposing-agent", "publishing-agent"].includes(agentRef),
  };
}

export function StepResultPanel({ projectId, runId, step, campaignId }: { projectId: string; runId: string; step: AgentRunStepData; campaignId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [createdContentItemId, setCreatedContentItemId] = useState<string | null>(null);
  const [createdPostCount, setCreatedPostCount] = useState<number | null>(null);

  if (!step.output || step.status !== "COMPLETED") return null;
  const actions = compatibleActions(step.agentRef, step.output);

  async function handleSaveContentItem() {
    setBusy(true);
    const result = await saveAgentResultAsContentItemAction(projectId, runId, step.order, { mode: "create" });
    setBusy(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Guardado como contenido.");
      setCreatedContentItemId(result.id ?? null);
      router.refresh();
    }
  }

  async function handleSavePillars() {
    if (!campaignId) {
      toast.error("Esta ejecución no tiene una campaña asociada.");
      return;
    }
    setBusy(true);
    const result = await saveAgentResultAsCampaignPillarsAction(projectId, runId, step.order, campaignId);
    setBusy(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`${result.created} pilares guardados en la campaña.`);
      router.refresh();
    }
  }

  async function handleSaveSocialPosts() {
    setBusy(true);
    const result = await saveAgentResultAsSocialPostsAction(projectId, runId, step.order, {});
    setBusy(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`${result.created} publicaciones creadas en Publishing Hub.`);
      if (result.failures?.length) toast.error(result.failures.join(" · "));
      setCreatedPostCount(result.created ?? 0);
      router.refresh();
    }
  }

  async function handleSavePrompt() {
    setBusy(true);
    const result = await saveAgentResultAsPromptAction(projectId, runId, step.order, promptTitle || `Resultado de ${step.agentRef}`);
    setBusy(false);
    setPromptDialogOpen(false);
    if (result.error) toast.error(result.error);
    else toast.success("Guardado en Prompt Library.");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
      {actions.contentItem ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleSaveContentItem}>
          <Save className="size-3.5" /> Guardar como contenido
        </Button>
      ) : null}
      {actions.pillars ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleSavePillars}>
          <Layers className="size-3.5" /> Guardar como pilares
        </Button>
      ) : null}
      {actions.socialPosts ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleSaveSocialPosts}>
          <Send className="size-3.5" /> Crear publicaciones
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPromptDialogOpen(true)}>
        <BookmarkPlus className="size-3.5" /> Guardar como prompt
      </Button>
      {createdContentItemId ? (
        <Link href={`/dashboard/${projectId}/content/${createdContentItemId}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="size-3" /> Abrir en AI Editor Pro
        </Link>
      ) : null}
      {createdPostCount !== null && createdPostCount > 0 ? (
        <Link href={`/dashboard/${projectId}/publishing`} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="size-3" /> Ver en Publishing Hub
        </Link>
      ) : null}

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Guardar como prompt</DialogTitle>
          </DialogHeader>
          <Input value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} placeholder="Título del prompt" maxLength={200} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPromptDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy} onClick={handleSavePrompt}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import { createAgentRunAction } from "@/server/actions/agent-runs";
import { Button } from "@/components/ui/button";

export function NewAgentRunButton({
  projectId,
  officialAgentKey,
  customAgentId,
  teamId,
  label = "Ejecutar",
  variant = "default",
}: {
  projectId: string;
  officialAgentKey?: string;
  customAgentId?: string;
  teamId?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    if (creating) return;
    setCreating(true);
    const idempotencyKey = crypto.randomUUID();
    const result = await createAgentRunAction(projectId, { idempotencyKey, officialAgentKey, customAgentId, teamId });
    if (result.error || !result.id) {
      toast.error(result.error ?? "No se pudo crear la ejecución.");
      setCreating(false);
      return;
    }
    router.push(`/dashboard/${projectId}/agents/runs/${result.id}`);
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} disabled={creating}>
      {creating ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {label}
    </Button>
  );
}

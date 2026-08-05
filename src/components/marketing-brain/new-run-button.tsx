"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { createMarketingBrainRunAction } from "@/server/actions/marketing-brain";
import { Button } from "@/components/ui/button";

export function NewRunButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    if (creating) return;
    setCreating(true);
    const idempotencyKey = crypto.randomUUID();
    const result = await createMarketingBrainRunAction(projectId, { idempotencyKey });
    if (result.error || !result.id) {
      toast.error(result.error ?? "No se pudo crear el plan.");
      setCreating(false);
      return;
    }
    router.push(`/dashboard/${projectId}/marketing-brain/${result.id}`);
  }

  return (
    <Button type="button" onClick={handleClick} disabled={creating}>
      {creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Crear plan con IA
    </Button>
  );
}

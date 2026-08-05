"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LineChart, Loader2 } from "lucide-react";
import { createAgentRunAction, updateAgentRunInputAction } from "@/server/actions/agent-runs";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

/**
 * Starts a Performance Strategist AI Agent run pre-filled from a Marketing
 * Brain / Performance Center entry point (Fase 36 spec sections 25-26) —
 * creates the DRAFT run and seeds its input, but NEVER auto-executes it: the
 * user always lands on the normal agent input form to review/confirm before
 * anything runs. Every prefilled ID still gets re-validated server-side the
 * same way any other agent input does (buildInputZodSchema + this
 * capability's own ownership checks in agent-performance-strategist.ts) —
 * nothing here is trusted just because it came from a link.
 */
export function StartPerformanceStrategistRunButton({
  projectId,
  prefill,
  label = "Analizar con Performance Strategist",
  variant = "outline",
  size = "sm",
}: {
  projectId: string;
  prefill: { mode: "ANALYZE" | "PREPARE_STRATEGY" | "REVIEW_EXISTING" | "PREPARE_MEASUREMENT" | "PREPARE_REVIEW"; campaignId?: string; optimizationSessionId?: string; contentItemId?: string; socialPostId?: string };
  label?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function handleClick() {
    setStarting(true);
    const created = await createAgentRunAction(projectId, { idempotencyKey: crypto.randomUUID(), officialAgentKey: "performance-strategist" });
    if (created.error || !created.id) {
      toast.error(created.error ?? "No se pudo crear la ejecución.");
      setStarting(false);
      return;
    }
    await updateAgentRunInputAction(projectId, created.id, { values: prefill, context: {} });
    router.push(`/dashboard/${projectId}/agents/runs/${created.id}`);
  }

  return (
    <Button type="button" variant={variant} size={size} disabled={starting} onClick={handleClick}>
      {starting ? <Loader2 className="size-3.5 animate-spin" /> : <LineChart className="size-3.5" />} {label}
    </Button>
  );
}

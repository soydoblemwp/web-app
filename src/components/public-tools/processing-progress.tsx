"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { computePercent } from "@/lib/public-tools/files/progress";

/** Shared progress UI for long-running operations (spec section 26) — step text, real percent when calculable, and a cancel button. Never shows 100% before the file is actually ready. */
export function ProcessingProgress({
  step,
  current,
  total,
  onCancel,
}: {
  step: string;
  current: number;
  total: number;
  onCancel?: () => void;
}) {
  const percent = computePercent(current, total);
  return (
    <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <p>
        {step} {total > 0 ? `(${current} de ${total})` : ""}
      </p>
      {percent !== null ? <Progress value={percent} /> : null}
      {onCancel ? (
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}

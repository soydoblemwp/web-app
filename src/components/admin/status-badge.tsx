import { Badge } from "@/components/ui/badge";

const POSITIVE = new Set(["ACTIVE", "OK", "CONNECTED", "SUCCESS", "PUBLISHED", "APPROVED"]);
const NEGATIVE = new Set(["ERROR", "FAILED", "SUSPENDED", "BROKEN", "DISCONNECTED"]);
const NEUTRAL_WARNING = new Set(["PAUSED", "CHANGED", "SCHEDULED", "PENDING", "RUNNING", "SKIPPED"]);

/** Consistent color-coding for the many status enums shown across the admin panel. */
export function StatusBadge({ status }: { status: string }) {
  const variant = POSITIVE.has(status)
    ? "secondary"
    : NEGATIVE.has(status)
      ? "destructive"
      : NEUTRAL_WARNING.has(status)
        ? "outline"
        : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

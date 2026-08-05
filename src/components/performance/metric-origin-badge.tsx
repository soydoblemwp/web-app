import { Badge } from "@/components/ui/badge";
import { METRIC_ORIGIN_LABELS, METRIC_ORIGIN_TONE } from "@/components/performance/labels";

/** Every metric value shown anywhere must carry its origin (spec section 2) — never presenting an estimate/import as an internally-verified fact. */
export function MetricOriginBadge({ source }: { source: string }) {
  return <Badge variant={METRIC_ORIGIN_TONE[source] ?? "outline"}>{METRIC_ORIGIN_LABELS[source] ?? source}</Badge>;
}

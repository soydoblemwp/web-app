import { Badge } from "@/components/ui/badge";
import { DATA_QUALITY_LABELS, DATA_QUALITY_TONE } from "@/components/performance/labels";

interface DataQualityPanelProps {
  score: number;
  level: string;
  warnings?: string[];
  compact?: boolean;
}

/** Shown wherever a comparison/report/dashboard presents a conclusion — never lets a number stand alone without its quality context (spec section 16). */
export function DataQualityPanel({ score, level, warnings = [], compact }: DataQualityPanelProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant={DATA_QUALITY_TONE[level] ?? "outline"}>{DATA_QUALITY_LABELS[level] ?? level}</Badge>
        {score}/100
      </span>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">Calidad de datos:</span>
        <Badge variant={DATA_QUALITY_TONE[level] ?? "outline"}>{DATA_QUALITY_LABELS[level] ?? level}</Badge>
        <span className="text-xs text-muted-foreground">{score}/100</span>
      </div>
      {warnings.length > 0 ? (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

import type { WorkflowDiffResult, WorkflowDiffStepChange } from "@/lib/ai-workflows/workflow-diff";
import { Badge } from "@/components/ui/badge";

const STEP_CHANGE_BADGE_LABEL: Record<WorkflowDiffStepChange["kind"], string> = {
  added: "Añadido",
  removed: "Eliminado",
  moved: "Movido",
  type_changed: "Tipo cambiado",
  tool_changed: "Herramienta cambiada",
  prompt_changed: "Prompt cambiado",
  template_changed: "Template cambiado",
  brand_kit_changed: "Brand Kit cambiado",
  transform_changed: "Transformación cambiada",
  input_changed: "Entrada cambiada",
  output_variable_changed: "Variable de salida cambiada",
  sub_workflow_changed: "Sub-workflow cambiado",
};

const STEP_CHANGE_VARIANT: Record<WorkflowDiffStepChange["kind"], "default" | "destructive" | "outline" | "secondary"> = {
  added: "default",
  removed: "destructive",
  moved: "outline",
  type_changed: "secondary",
  tool_changed: "secondary",
  prompt_changed: "secondary",
  template_changed: "secondary",
  brand_kit_changed: "secondary",
  transform_changed: "secondary",
  input_changed: "secondary",
  output_variable_changed: "secondary",
  sub_workflow_changed: "secondary",
};

/** Structural, testable diff rendered as readable rows — never raw JSON. Shared by the publish dialog (draft vs active published) and the versions panel (any two revisions). */
export function WorkflowDiffView({ diff }: { diff: WorkflowDiffResult }) {
  if (!diff.hasChanges) {
    return <p className="text-sm text-muted-foreground">No hay diferencias.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {diff.metadataChanges.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Metadata</p>
          {diff.metadataChanges.map((change) => (
            <div key={change.field} className="flex items-center gap-2 text-xs">
              <Badge variant="outline">{change.field}</Badge>
              <span className="text-muted-foreground">
                {change.field === "tags" ? (Array.isArray(change.before) ? change.before.join(", ") : "") : String(change.before ?? "—")} →{" "}
                {change.field === "tags" ? (Array.isArray(change.after) ? change.after.join(", ") : "") : String(change.after ?? "—")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {diff.stepChanges.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Pasos</p>
          {diff.stepChanges.map((change, index) => (
            <div key={`${change.stepId}-${change.kind}-${index}`} className="flex items-center gap-2 text-xs">
              <Badge variant={STEP_CHANGE_VARIANT[change.kind]}>{STEP_CHANGE_BADGE_LABEL[change.kind]}</Badge>
              <span>{change.label}</span>
              {change.detail ? <span className="text-muted-foreground">({change.detail})</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {diff.variablesAdded.length > 0 || diff.variablesRemoved.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Variables</p>
          <div className="flex flex-wrap gap-1.5">
            {diff.variablesAdded.map((v) => (
              <Badge key={`add-${v}`} variant="default">
                +{`{{${v}}}`}
              </Badge>
            ))}
            {diff.variablesRemoved.map((v) => (
              <Badge key={`rem-${v}`} variant="destructive">
                −{`{{${v}}}`}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

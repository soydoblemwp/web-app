"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAutomationAction } from "@/server/actions/automation-import-export";

/** Safe JSON export (spec section 38) — excludes internal IDs, secrets, runs, projectId; never auto-executes on re-import. */
export function ExportAutomationButton({ projectId, automationId, name }: { projectId: string; automationId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = await exportAutomationAction(projectId, automationId);
          if (!data) {
            toast.error("No se pudo exportar la automatización.");
            return;
          }
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.automation.json`;
          a.click();
          URL.revokeObjectURL(url);
        })
      }
    >
      <Download className="size-4" /> Exportar
    </Button>
  );
}

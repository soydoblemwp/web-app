"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePublishingPolicyAction } from "@/server/actions/publishing";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PublishingPolicyForm({
  projectId,
  requireApprovalBeforePublish,
  allowSelfApproval,
}: {
  projectId: string;
  requireApprovalBeforePublish: boolean;
  allowSelfApproval: boolean;
}) {
  const [requireApproval, setRequireApproval] = useState(requireApprovalBeforePublish);
  const [selfApproval, setSelfApproval] = useState(allowSelfApproval);
  const [isPending, startTransition] = useTransition();

  function update(patch: { requireApprovalBeforePublish?: boolean; allowSelfApproval?: boolean }) {
    startTransition(async () => {
      const result = await updatePublishingPolicyAction(projectId, patch);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="require-approval">Requerir aprobación antes de publicar</Label>
          <p className="text-xs text-muted-foreground">Las publicaciones no podrán programarse hasta ser aprobadas por un revisor.</p>
        </div>
        <Switch
          id="require-approval"
          checked={requireApproval}
          disabled={isPending}
          onCheckedChange={(checked) => {
            setRequireApproval(checked);
            update({ requireApprovalBeforePublish: checked });
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="allow-self-approval">Permitir autoaprobación</Label>
          <p className="text-xs text-muted-foreground">Si se desactiva, quien crea una publicación no podrá aprobar su propia publicación.</p>
        </div>
        <Switch
          id="allow-self-approval"
          checked={selfApproval}
          disabled={isPending}
          onCheckedChange={(checked) => {
            setSelfApproval(checked);
            update({ allowSelfApproval: checked });
          }}
        />
      </div>
    </div>
  );
}

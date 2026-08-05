"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultChecklistForPlatform, computeChecklistProgress, type ChecklistItem } from "@/lib/publishing/checklists";
import { getChecklistTemplateAction } from "@/server/actions/publishing-checklist-read";
import { updatePublicationChecklistStateAction } from "@/server/actions/publishing-templates";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import type { SocialPlatform } from "@/generated/prisma/enums";

export function ChecklistPanel({
  projectId,
  postId,
  platform,
  state,
  onStateChange,
}: {
  projectId: string;
  postId: string;
  platform: string;
  state: Record<string, boolean> | null;
  onStateChange: (state: Record<string, boolean>) => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(defaultChecklistForPlatform(platform as SocialPlatform));

  useEffect(() => {
    let cancelled = false;
    getChecklistTemplateAction(projectId, platform).then((template) => {
      if (!cancelled && template) setItems(template.items as unknown as ChecklistItem[]);
      else if (!cancelled) setItems(defaultChecklistForPlatform(platform as SocialPlatform));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, platform]);

  const progress = computeChecklistProgress(items, state);

  async function toggle(itemId: string) {
    const next = { ...(state ?? {}), [itemId]: !(state?.[itemId] ?? false) };
    onStateChange(next);
    const result = await updatePublicationChecklistStateAction(projectId, postId, next);
    if (result.error) toast.error(result.error);
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Checklist</Label>
        <span className="text-xs font-medium">{progress}%</span>
      </div>
      <Progress value={progress} />
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs">
            <Checkbox checked={state?.[item.id] === true} onCheckedChange={() => toggle(item.id)} id={`chk-${item.id}`} />
            <label htmlFor={`chk-${item.id}`} className="cursor-pointer">
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

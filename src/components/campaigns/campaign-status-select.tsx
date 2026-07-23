"use client";

import { useTransition } from "react";
import { changeCampaignStatusAction } from "@/server/actions/campaign";
import { campaignStatusValues } from "@/lib/validation/social";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CampaignStatusSelect({
  projectId,
  campaignId,
  status,
}: {
  projectId: string;
  campaignId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={status}
      disabled={isPending}
      onValueChange={(value) => {
        if (!value) return;
        startTransition(() => {
          changeCampaignStatusAction(projectId, campaignId, value);
        });
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {campaignStatusValues.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

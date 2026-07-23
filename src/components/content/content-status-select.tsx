"use client";

import { useTransition } from "react";
import { changeContentStatusAction } from "@/server/actions/content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_VALUES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] as const;

export function ContentStatusSelect({
  projectId,
  contentId,
  status,
}: {
  projectId: string;
  contentId: string;
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
          changeContentStatusAction(projectId, contentId, value);
        });
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_VALUES.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

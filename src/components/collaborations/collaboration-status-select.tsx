"use client";

import { useTransition } from "react";
import { changeCollaborationStatusAction } from "@/server/actions/collaboration";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_VALUES = [
  "LEAD",
  "CONTACTED",
  "NEGOTIATING",
  "AGREED",
  "IN_PROGRESS",
  "DELIVERED",
  "PAID",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

export function CollaborationStatusSelect({
  projectId,
  collaborationId,
  status,
}: {
  projectId: string;
  collaborationId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={status}
      disabled={isPending}
      onValueChange={(value) => {
        if (!value) return;
        startTransition(() => changeCollaborationStatusAction(projectId, collaborationId, value));
      }}
    >
      <SelectTrigger className="w-48">
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

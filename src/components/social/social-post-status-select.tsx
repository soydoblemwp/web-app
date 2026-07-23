"use client";

import { useTransition } from "react";
import { changeSocialPostStatusAction } from "@/server/actions/social";
import { socialPostStatusValues } from "@/lib/validation/social";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SocialPostStatusSelect({
  projectId,
  postId,
  status,
}: {
  projectId: string;
  postId: string;
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
          changeSocialPostStatusAction(projectId, postId, value);
        });
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {socialPostStatusValues.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

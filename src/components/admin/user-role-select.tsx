"use client";

import { useTransition } from "react";
import { changeUserRoleAction } from "@/server/actions/admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["USER", "EDITOR", "ADMIN", "SUPER_ADMIN"];

export function UserRoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={role}
      disabled={disabled || isPending}
      onValueChange={(value) => {
        if (!value) return;
        startTransition(() => changeUserRoleAction(userId, value));
      }}
    >
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

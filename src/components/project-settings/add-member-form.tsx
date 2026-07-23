"use client";

import { useActionState } from "react";
import { addProjectMemberAction, type AddMemberFormState } from "@/server/actions/project-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: AddMemberFormState = {};

export function AddMemberForm({ projectId }: { projectId: string }) {
  const action = addProjectMemberAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <Input name="email" type="email" required placeholder="correo@ejemplo.com" />
        {state.error ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
        {state.success ? <p className="mt-1 text-xs text-emerald-600">{state.success}</p> : null}
      </div>
      <Select name="role" defaultValue="EDITOR">
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="VIEWER">Viewer</SelectItem>
          <SelectItem value="EDITOR">Editor</SelectItem>
          <SelectItem value="MANAGER">Manager</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={isPending}>
        Añadir
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createMonitorAction, type MonitorFormState } from "@/server/actions/monitor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: MonitorFormState = {};

export function CreateMonitorForm({ projectId }: { projectId: string }) {
  const action = createMonitorAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <Input id="url" name="url" type="url" required placeholder="https://" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="checkFrequencyMinutes">Frecuencia de revisión</Label>
        <Select name="checkFrequencyMinutes" defaultValue="1440">
          <SelectTrigger id="checkFrequencyMinutes" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">Cada hora</SelectItem>
            <SelectItem value="360">Cada 6 horas</SelectItem>
            <SelectItem value="1440">Diaria</SelectItem>
            <SelectItem value="10080">Semanal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      <Button type="submit" disabled={isPending} className="sm:col-span-2">
        {isPending ? "Comprobando..." : "Crear monitor y comprobar ahora"}
      </Button>
    </form>
  );
}

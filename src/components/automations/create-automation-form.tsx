"use client";

import { useActionState, useState } from "react";
import { createAutomationAction, type AutomationFormState } from "@/server/actions/automation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: AutomationFormState = {};

export function CreateAutomationForm({
  projectId,
  monitors,
}: {
  projectId: string;
  monitors: { id: string; name: string }[];
}) {
  const action = createAutomationAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [actionType, setActionType] = useState("CREATE_NOTIFICATION");

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="triggerType">Disparador</Label>
          <Select name="triggerType" defaultValue="MANUAL">
            <SelectTrigger id="triggerType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="SCHEDULE_DAILY">Programación diaria</SelectItem>
              <SelectItem value="SCHEDULE_WEEKLY">Programación semanal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" rows={2} maxLength={500} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="actionType">Acción</Label>
          <Select
            name="actionType"
            value={actionType}
            onValueChange={(value) => {
              if (value) setActionType(value);
            }}
          >
            <SelectTrigger id="actionType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CREATE_NOTIFICATION">Crear notificación interna</SelectItem>
              <SelectItem value="RUN_MONITOR">Ejecutar un monitor</SelectItem>
              <SelectItem value="RUN_LINK_CHECK">Comprobar un enlace</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {actionType === "CREATE_NOTIFICATION" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="notificationTitle">Título de la notificación</Label>
              <Input id="notificationTitle" name="notificationTitle" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notificationMessage">Mensaje</Label>
              <Input id="notificationMessage" name="notificationMessage" maxLength={500} />
            </div>
          </>
        ) : null}

        {actionType === "RUN_MONITOR" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="monitorId">Monitor</Label>
            <Select name="monitorId">
              <SelectTrigger id="monitorId" className="w-full">
                <SelectValue placeholder="Selecciona un monitor" />
              </SelectTrigger>
              <SelectContent>
                {monitors.length === 0 ? (
                  <SelectItem value="" disabled>
                    No hay monitores creados
                  </SelectItem>
                ) : (
                  monitors.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {actionType === "RUN_LINK_CHECK" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="linkUrl">URL a comprobar</Label>
            <Input id="linkUrl" name="linkUrl" type="url" placeholder="https://" />
          </div>
        ) : null}
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear automatización"}
      </Button>
    </form>
  );
}

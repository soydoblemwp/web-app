"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { rotateWebhookSecretAction } from "@/server/actions/automations";
import { sendWebhookTestAction } from "@/server/actions/automation-webhooks";
import { formatDateTime } from "@/components/automations/labels";

interface WebhookPanelProps {
  projectId: string;
  automationId: string;
  publicId: string | null;
  receivedCount: number;
  lastReceivedAt: string | null;
}

export function WebhookPanel({ projectId, automationId, publicId, receivedCount, lastReceivedAt }: WebhookPanelProps) {
  const [pending, startTransition] = useTransition();
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);

  if (!publicId) return null;

  const url = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/automations/${publicId}` : `/api/webhooks/automations/${publicId}`;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">URL del webhook</p>
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={() => copy(url)}>
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Firma cada solicitud con HMAC-SHA256 sobre <code>{"${X-Automation-Timestamp}.${body}"}</code> usando el secreto, y envía los headers <code>X-Automation-Timestamp</code>, <code>X-Automation-Signature</code> y{" "}
        <code>X-Automation-Delivery</code>.
      </p>

      {rotatedSecret ? (
        <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2">
          <p className="text-xs font-medium">Nuevo secreto — cópialo ahora, no se volverá a mostrar</p>
          <div className="flex gap-2">
            <Input readOnly value={rotatedSecret} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={() => copy(rotatedSecret)}>
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRotateOpen(true)}>
          <RefreshCw className="size-4" /> Rotar secreto
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendWebhookTestAction(projectId, automationId);
              if (result.ok) toast.success("Prueba enviada y procesada correctamente.");
              else toast.error(result.error ?? "La prueba no pasó la validación.");
            })
          }
        >
          <Send className="size-4" /> Enviar prueba
        </Button>
        <Badge variant="outline">{receivedCount} entregas recibidas</Badge>
        {lastReceivedAt ? <span className="text-xs text-muted-foreground">Última: {formatDateTime(lastReceivedAt)}</span> : null}
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Rotar el secreto del webhook"
        description="El secreto anterior dejará de funcionar de inmediato. Actualiza cualquier sistema externo que envíe solicitudes a este webhook con el nuevo secreto."
        confirmLabel="Rotar secreto"
        onConfirm={() =>
          startTransition(async () => {
            const result = await rotateWebhookSecretAction(projectId, automationId);
            if (result.secret) setRotatedSecret(result.secret);
            else toast.error(result.error ?? "No se pudo rotar el secreto.");
          })
        }
      />
    </div>
  );
}

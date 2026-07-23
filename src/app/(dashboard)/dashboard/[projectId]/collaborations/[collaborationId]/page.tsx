import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trash2, CheckSquare, Square } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import {
  addCollaborationContactAction,
  addCollaborationDeliverableAction,
  toggleDeliverableAction,
  deleteCollaborationAction,
} from "@/server/actions/collaboration";
import { CollaborationStatusSelect } from "@/components/collaborations/collaboration-status-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Colaboración" };

export default async function CollaborationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; collaborationId: string }>;
}) {
  const { projectId, collaborationId } = await params;
  const collaboration = await prisma.collaboration.findUnique({
    where: { id: collaborationId },
    include: { contacts: true, deliverables: true, payments: true },
  });
  if (!collaboration || collaboration.projectId !== projectId) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{collaboration.brandName}</h1>
          <p className="text-sm text-muted-foreground">{collaboration.notes}</p>
        </div>
        <form action={deleteCollaborationAction.bind(null, projectId, collaboration.id)}>
          <Button type="submit" variant="outline" size="icon" aria-label="Eliminar">
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Estado</Label>
        <CollaborationStatusSelect projectId={projectId} collaborationId={collaboration.id} status={collaboration.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contactos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={addCollaborationContactAction.bind(null, projectId, collaboration.id)} className="flex flex-wrap gap-2">
            <Input name="name" placeholder="Nombre" required className="w-40" />
            <Input name="email" type="email" placeholder="Correo" className="w-48" />
            <Input name="phone" placeholder="Teléfono" className="w-36" />
            <Button type="submit" size="sm">
              Añadir
            </Button>
          </form>
          {collaboration.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos todavía.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {collaboration.contacts.map((contact) => (
                <li key={contact.id}>
                  {contact.name} {contact.email ? `· ${contact.email}` : ""} {contact.phone ? `· ${contact.phone}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={addCollaborationDeliverableAction.bind(null, projectId, collaboration.id)} className="flex gap-2">
            <Input name="description" placeholder="Descripción del entregable" required className="flex-1" />
            <Button type="submit" size="sm">
              Añadir
            </Button>
          </form>
          {collaboration.deliverables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin entregables todavía.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {collaboration.deliverables.map((deliverable) => (
                <li key={deliverable.id} className="flex items-center gap-2">
                  <form action={toggleDeliverableAction.bind(null, projectId, deliverable.id, !deliverable.isDelivered)}>
                    <button type="submit" aria-label="Marcar entregado" className="text-muted-foreground hover:text-foreground">
                      {deliverable.isDelivered ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                    </button>
                  </form>
                  <span className={deliverable.isDelivered ? "line-through text-muted-foreground" : ""}>
                    {deliverable.description}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";

export interface CollaborationFormState {
  error?: string;
}

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

export async function createCollaborationAction(
  projectId: string,
  _prevState: CollaborationFormState,
  formData: FormData
): Promise<CollaborationFormState> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const brandName = String(formData.get("brandName") ?? "").trim();
  if (!brandName) return { error: "El nombre de la marca es obligatorio." };

  const collaboration = await prisma.collaboration.create({
    data: {
      projectId,
      ownerId: user.id,
      brandName,
      collaborationType: String(formData.get("collaborationType") ?? "") || null,
      productReceived: String(formData.get("productReceived") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    },
  });

  revalidatePath(`/dashboard/${projectId}/collaborations`);
  redirect(`/dashboard/${projectId}/collaborations/${collaboration.id}`);
}

export async function changeCollaborationStatusAction(projectId: string, collaborationId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  if (!STATUS_VALUES.includes(status)) return;
  await prisma.collaboration.update({ where: { id: collaborationId }, data: { status: status as never } });
  revalidatePath(`/dashboard/${projectId}/collaborations`);
  revalidatePath(`/dashboard/${projectId}/collaborations/${collaborationId}`);
}

export async function addCollaborationContactAction(projectId: string, collaborationId: string, formData: FormData) {
  await requireProjectAccess(projectId, "EDITOR");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.collaborationContact.create({
    data: {
      collaborationId,
      name,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
    },
  });
  revalidatePath(`/dashboard/${projectId}/collaborations/${collaborationId}`);
}

export async function addCollaborationDeliverableAction(
  projectId: string,
  collaborationId: string,
  formData: FormData
) {
  await requireProjectAccess(projectId, "EDITOR");
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  await prisma.collaborationDeliverable.create({
    data: { collaborationId, description },
  });
  revalidatePath(`/dashboard/${projectId}/collaborations/${collaborationId}`);
}

export async function toggleDeliverableAction(projectId: string, deliverableId: string, delivered: boolean) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.collaborationDeliverable.update({
    where: { id: deliverableId },
    data: { isDelivered: delivered, deliveredAt: delivered ? new Date() : null },
  });
  revalidatePath(`/dashboard/${projectId}/collaborations`);
}

export async function deleteCollaborationAction(projectId: string, collaborationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.collaboration.delete({ where: { id: collaborationId } });
  revalidatePath(`/dashboard/${projectId}/collaborations`);
  redirect(`/dashboard/${projectId}/collaborations`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/permissions";
import { signOut } from "@/auth";
import { updateProfileSchema, changePasswordSchema } from "@/lib/validation/auth";

export interface AccountFormState {
  error?: string;
  success?: string;
}

export async function updateProfileAction(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const user = await requireUser();

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/account");
  return { success: "Perfil actualizado." };
}

export async function changePasswordAction(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.passwordHash) return { error: "Esta cuenta no tiene contraseña configurada." };

  const isValid = await bcrypt.compare(parsed.data.currentPassword, dbUser.passwordHash);
  if (!isValid) return { error: "La contraseña actual no es correcta." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { success: "Contraseña actualizada." };
}

export async function deleteAccountAction() {
  const user = await requireUser();

  const ownedWorkspaces = await prisma.workspace.count({ where: { ownerId: user.id } });
  if (ownedWorkspaces > 0) {
    redirect("/account?error=owns-workspace");
  }

  await prisma.user.delete({ where: { id: user.id } });
  await signOut({ redirectTo: "/" });
}

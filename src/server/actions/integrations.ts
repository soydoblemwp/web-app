"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { verifyWordPressConnection, WordPressConnectionError } from "@/lib/integrations/wordpress";
import { verifyGitHubToken, GitHubConnectionError } from "@/lib/integrations/github";

export interface IntegrationFormState {
  error?: string;
  success?: string;
}

export async function saveWordPressConnectionAction(
  projectId: string,
  _prevState: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const appPassword = String(formData.get("appPassword") ?? "").trim();

  if (!siteUrl || !username || !appPassword) {
    return { error: "Todos los campos son obligatorios." };
  }

  let verified;
  try {
    verified = await verifyWordPressConnection({ siteUrl, username, appPassword });
  } catch (error) {
    await prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "WORDPRESS" } },
      create: { projectId, type: "WORDPRESS", status: "ERROR", lastError: (error as Error).message },
      update: { status: "ERROR", lastError: (error as Error).message, lastCheckedAt: new Date() },
    });
    return { error: error instanceof WordPressConnectionError ? error.message : "No se pudo verificar la conexión." };
  }

  await prisma.$transaction([
    prisma.wordPressConnection.upsert({
      where: { projectId },
      create: {
        projectId,
        siteUrl,
        username,
        encryptedAppPassword: encryptSecret(appPassword),
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
      update: {
        siteUrl,
        username,
        encryptedAppPassword: encryptSecret(appPassword),
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
    }),
    prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "WORDPRESS" } },
      create: { projectId, type: "WORDPRESS", status: "CONNECTED", lastCheckedAt: new Date() },
      update: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/integrations/wordpress`);
  return { success: `Conectado como ${verified.name}.` };
}

export async function retestWordPressConnectionAction(projectId: string): Promise<IntegrationFormState> {
  await requireProjectAccess(projectId, "EDITOR");
  const connection = await prisma.wordPressConnection.findUnique({ where: { projectId } });
  if (!connection) return { error: "No hay ninguna conexión guardada." };

  try {
    const verified = await verifyWordPressConnection({
      siteUrl: connection.siteUrl,
      username: connection.username,
      appPassword: decryptSecret(connection.encryptedAppPassword),
    });
    await prisma.$transaction([
      prisma.wordPressConnection.update({
        where: { projectId },
        data: { status: "CONNECTED", lastVerifiedAt: new Date() },
      }),
      prisma.integration.upsert({
        where: { projectId_type: { projectId, type: "WORDPRESS" } },
        create: { projectId, type: "WORDPRESS", status: "CONNECTED", lastCheckedAt: new Date() },
        update: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null },
      }),
    ]);
    revalidatePath(`/dashboard/${projectId}/integrations/wordpress`);
    return { success: `Conectado como ${verified.name}.` };
  } catch (error) {
    const message = error instanceof WordPressConnectionError ? error.message : "No se pudo verificar la conexión.";
    await prisma.$transaction([
      prisma.wordPressConnection.update({ where: { projectId }, data: { status: "ERROR" } }),
      prisma.integration.upsert({
        where: { projectId_type: { projectId, type: "WORDPRESS" } },
        create: { projectId, type: "WORDPRESS", status: "ERROR", lastError: message },
        update: { status: "ERROR", lastError: message, lastCheckedAt: new Date() },
      }),
    ]);
    revalidatePath(`/dashboard/${projectId}/integrations/wordpress`);
    return { error: message };
  }
}

export async function disconnectWordPressAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.wordPressConnection.deleteMany({ where: { projectId } });
  await prisma.integration.upsert({
    where: { projectId_type: { projectId, type: "WORDPRESS" } },
    create: { projectId, type: "WORDPRESS", status: "DISCONNECTED" },
    update: { status: "DISCONNECTED", lastError: null },
  });
  revalidatePath(`/dashboard/${projectId}/integrations/wordpress`);
}

export async function saveGitHubConnectionAction(
  projectId: string,
  _prevState: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "El token es obligatorio." };

  let verified;
  try {
    verified = await verifyGitHubToken(token);
  } catch (error) {
    await prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "GITHUB" } },
      create: { projectId, type: "GITHUB", status: "ERROR", lastError: (error as Error).message },
      update: { status: "ERROR", lastError: (error as Error).message, lastCheckedAt: new Date() },
    });
    return { error: error instanceof GitHubConnectionError ? error.message : "No se pudo verificar el token." };
  }

  await prisma.$transaction([
    prisma.gitHubConnection.upsert({
      where: { projectId },
      create: {
        projectId,
        accountLogin: verified.login,
        encryptedAccessToken: encryptSecret(token),
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
      update: {
        accountLogin: verified.login,
        encryptedAccessToken: encryptSecret(token),
        status: "CONNECTED",
        lastVerifiedAt: new Date(),
      },
    }),
    prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "GITHUB" } },
      create: { projectId, type: "GITHUB", status: "CONNECTED", lastCheckedAt: new Date() },
      update: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/integrations/github`);
  return { success: `Conectado como @${verified.login}.` };
}

export async function disconnectGitHubAction(projectId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.gitHubConnection.deleteMany({ where: { projectId } });
  await prisma.integration.upsert({
    where: { projectId_type: { projectId, type: "GITHUB" } },
    create: { projectId, type: "GITHUB", status: "DISCONNECTED" },
    update: { status: "DISCONNECTED", lastError: null },
  });
  revalidatePath(`/dashboard/${projectId}/integrations/github`);
}

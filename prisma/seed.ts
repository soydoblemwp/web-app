import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Development-only demo data. Never run this against a production database —
 * it creates clearly-labeled sample accounts and content, not real users.
 */

if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_IN_PRODUCTION) {
  throw new Error("El seed de desarrollo no debe ejecutarse en producción.");
}

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está configurada. No se puede ejecutar el seed.");
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function randomPassword(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const freePlan = await prisma.plan.upsert({
    where: { tier: "FREE" },
    create: {
      tier: "FREE",
      name: "Gratis",
      maxProjects: 2,
      maxMembers: 3,
      maxAIGenerationsPerMonth: 50,
      maxAITokensPerMonth: 200_000,
      maxAutomations: 2,
      maxMonitors: 2,
      minMonitorFrequencyMinutes: 1440,
      maxIntegrations: 2,
      maxStorageMb: 500,
      maxCampaigns: 3,
      priceMonthlyCents: 0,
    },
    update: {},
  });

  await prisma.plan.upsert({
    where: { tier: "CREATOR" },
    create: {
      tier: "CREATOR",
      name: "Creator",
      maxProjects: 5,
      maxMembers: 5,
      maxAIGenerationsPerMonth: 300,
      maxAITokensPerMonth: 1_500_000,
      maxAutomations: 10,
      maxMonitors: 10,
      minMonitorFrequencyMinutes: 360,
      maxIntegrations: 5,
      maxStorageMb: 2_000,
      maxCampaigns: 10,
      priceMonthlyCents: 1900,
    },
    update: {},
  });

  await prisma.plan.upsert({
    where: { tier: "PRO" },
    create: {
      tier: "PRO",
      name: "Pro",
      maxProjects: 15,
      maxMembers: 15,
      maxAIGenerationsPerMonth: 1_500,
      maxAITokensPerMonth: 8_000_000,
      maxAutomations: 30,
      maxMonitors: 30,
      minMonitorFrequencyMinutes: 60,
      maxIntegrations: 15,
      maxStorageMb: 10_000,
      maxCampaigns: 40,
      priceMonthlyCents: 4900,
    },
    update: {},
  });

  await prisma.plan.upsert({
    where: { tier: "BUSINESS" },
    create: {
      tier: "BUSINESS",
      name: "Business",
      maxProjects: 100,
      maxMembers: 100,
      maxAIGenerationsPerMonth: 10_000,
      maxAITokensPerMonth: 50_000_000,
      maxAutomations: 200,
      maxMonitors: 200,
      minMonitorFrequencyMinutes: 60,
      maxIntegrations: 100,
      maxStorageMb: 100_000,
      maxCampaigns: 200,
      priceMonthlyCents: 14900,
    },
    update: {},
  });

  const adminPassword = randomPassword();
  const memberPassword = randomPassword();

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@dev.local" },
    create: {
      email: "admin@dev.local",
      name: "Admin de desarrollo",
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
    update: {},
  });

  const memberUser = await prisma.user.upsert({
    where: { email: "usuario@dev.local" },
    create: {
      email: "usuario@dev.local",
      name: "Usuario de desarrollo",
      role: "USER",
      passwordHash: await bcrypt.hash(memberPassword, 12),
    },
    update: {},
  });

  let workspace = await prisma.workspace.findUnique({ where: { slug: "demo" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Espacio de demostración",
        slug: "demo",
        ownerId: adminUser.id,
        members: {
          create: [
            { userId: adminUser.id, role: "OWNER" },
            { userId: memberUser.id, role: "MEMBER" },
          ],
        },
        subscription: { create: { planId: freePlan.id } },
      },
    });
  }

  let project = await prisma.project.findFirst({ where: { workspaceId: workspace.id } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        ownerId: adminUser.id,
        name: "Proyecto de demostración",
        description: "Proyecto de ejemplo generado por el seed de desarrollo. No es una marca real.",
        website: "https://example.com",
        industry: "Software",
        targetAudience: "Pequeñas empresas y creadores de contenido",
        primaryLanguage: "es",
        market: "España",
        timezone: "Europe/Madrid",
        tone: "Cercano y profesional",
        goals: "Aumentar la visibilidad de marca y generar leads cualificados.",
        members: {
          create: [
            { userId: adminUser.id, role: "OWNER" },
            { userId: memberUser.id, role: "EDITOR" },
          ],
        },
        brandKit: {
          create: {
            name: "DemoBrand (ejemplo)",
            tagline: "Contenido claro, resultados reales.",
            tone: "Cercano, directo, sin jerga innecesaria.",
            valueProposition: "Ayudamos a equipos pequeños a publicar contenido de calidad sin perder tiempo.",
            colors: ["#111827", "#2563EB"],
            terms: {
              create: [
                { term: "innovador", isForbidden: false },
                { term: "garantizado", isForbidden: true },
              ],
            },
          },
        },
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        projectId: project.id,
        ownerId: adminUser.id,
        name: "Lanzamiento de ejemplo",
        description: "Campaña de demostración.",
        objective: "Dar a conocer el producto de ejemplo.",
        status: "ACTIVE",
      },
    });

    await prisma.contentItem.create({
      data: {
        projectId: project.id,
        authorId: adminUser.id,
        type: "BLOG_POST",
        title: "5 formas de organizar tu contenido (ejemplo)",
        body: "# 5 formas de organizar tu contenido\n\nEste es un artículo de ejemplo creado por el seed de desarrollo...",
        status: "DRAFT",
      },
    });

    await prisma.socialPost.create({
      data: {
        projectId: project.id,
        authorId: adminUser.id,
        campaignId: campaign.id,
        platform: "INSTAGRAM",
        postType: "post",
        internalTitle: "Anuncio de lanzamiento (ejemplo)",
        text: "🚀 Ya está aquí. Descúbrelo en el enlace de la bio. (contenido de ejemplo)",
        status: "DRAFT",
        hashtags: ["lanzamiento", "ejemplo"],
      },
    });
  }

  console.log("\nSeed de desarrollo completado.");
  console.log("Usuarios creados (contraseñas generadas aleatoriamente, válidas solo para esta ejecución):");
  console.log(`  admin@dev.local     / ${adminPassword}  (SUPER_ADMIN)`);
  console.log(`  usuario@dev.local   / ${memberPassword}  (USER)`);
  console.log("Cambia estas contraseñas o elimina estos usuarios antes de ir a producción.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

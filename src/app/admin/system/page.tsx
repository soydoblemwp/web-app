import { readdirSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración · Estado del sistema" };

interface CheckResult {
  label: string;
  value: string;
  ok: boolean;
}

async function checkDatabaseConnection(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { label: "Conexión con la base de datos", value: "Conectada", ok: true };
  } catch {
    return { label: "Conexión con la base de datos", value: "No disponible", ok: false };
  }
}

async function countTable(label: string, fn: () => Promise<number>): Promise<CheckResult> {
  try {
    const count = await fn();
    return { label, value: String(count), ok: true };
  } catch {
    return { label, value: "No disponible", ok: false };
  }
}

function countKnownMigrations(): CheckResult {
  try {
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const entries = readdirSync(migrationsDir, { withFileTypes: true });
    const count = entries.filter((e) => e.isDirectory()).length;
    return { label: "Migraciones conocidas", value: String(count), ok: true };
  } catch {
    return { label: "Migraciones conocidas", value: "No disponible en este entorno", ok: false };
  }
}

/** Presence only — the value of any of these variables is never read into the response. */
function envPresenceChecks(): CheckResult[] {
  return [
    { label: "DATABASE_URL configurada", value: Boolean(process.env.DATABASE_URL) ? "Sí" : "No", ok: Boolean(process.env.DATABASE_URL) },
    { label: "AUTH_SECRET configurado", value: Boolean(process.env.AUTH_SECRET) ? "Sí" : "No", ok: Boolean(process.env.AUTH_SECRET) },
    { label: "ENCRYPTION_KEY configurada", value: Boolean(process.env.ENCRYPTION_KEY) ? "Sí" : "No", ok: Boolean(process.env.ENCRYPTION_KEY) },
    { label: "CRON_SECRET configurado", value: Boolean(process.env.CRON_SECRET) ? "Sí" : "No", ok: Boolean(process.env.CRON_SECRET) },
  ];
}

function CheckCard({ check }: { check: CheckResult }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <p className="text-sm">{check.label}</p>
        <Badge variant={check.ok ? "secondary" : "destructive"}>{check.value}</Badge>
      </CardContent>
    </Card>
  );
}

export default async function AdminSystemPage() {
  // Each check is independent and wrapped so a single failure never breaks the page.
  const [dbCheck, userCount, projectCount, workspaceCount] = await Promise.all([
    checkDatabaseConnection(),
    countTable("Tabla User accesible", () => prisma.user.count()),
    countTable("Tabla Project accesible", () => prisma.project.count()),
    countTable("Tabla Workspace accesible", () => prisma.workspace.count()),
  ]);

  const migrationsCheck = countKnownMigrations();
  const envChecks = envPresenceChecks();
  const deploymentRef =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.npm_package_version || "No disponible";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estado del sistema</h1>
        <p className="text-sm text-muted-foreground">
          Solo información segura: nunca se muestra el valor de ninguna variable de entorno ni de ningún secreto.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conexión y entorno</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CheckCard check={dbCheck} />
          <CheckCard check={{ label: "Versión de Node", value: process.version, ok: true }} />
          <CheckCard check={{ label: "Entorno", value: process.env.NODE_ENV ?? "desconocido", ok: true }} />
          <CheckCard check={{ label: "Fecha y hora del servidor", value: new Date().toLocaleString("es-ES"), ok: true }} />
          <CheckCard check={migrationsCheck} />
          <CheckCard check={{ label: "Referencia de despliegue", value: deploymentRef, ok: deploymentRef !== "No disponible" }} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tablas principales (consultas mínimas)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CheckCard check={userCount} />
          <CheckCard check={projectCount} />
          <CheckCard check={workspaceCount} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Variables obligatorias (solo presencia, nunca el valor)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {envChecks.map((check) => (
            <CheckCard key={check.label} check={check} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inteligencia artificial</h2>
        <Card>
          <CardContent className="py-3 text-sm text-muted-foreground">
            La generación de IA se ejecuta 100% localmente en el navegador de cada usuario (WebGPU), no en este
            servidor. No existe ninguna clave de API de IA ni proveedor remoto configurado.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

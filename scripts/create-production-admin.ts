import { config as loadEnvFile } from "dotenv";
import path from "node:path";
import readline from "node:readline/promises";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * One-time, interactive setup script for the very first production
 * SUPER_ADMIN account. Deliberately NOT part of the public registration
 * flow, NOT a web route, and NOT wired into prisma/seed.ts (which creates
 * clearly-fake demo data and must never touch a production database).
 *
 * Run with: npm run admin:create
 */

// Prefer .env.production.local; process.env.DATABASE_URL (already set by the
// shell/host) always wins if present, since dotenv never overrides existing
// env vars — this is the "alternativa a process.env.DATABASE_URL" fallback.
loadEnvFile({ path: path.resolve(process.cwd(), ".env.production.local") });

const EMAIL_SCHEMA = z.string().trim().email("Introduce un correo electrónico válido.");
const MIN_PASSWORD_LENGTH = 12;

const KEY_ENTER = new Set(["\n", "\r"]);
const KEY_EOF = "\u0004"; // Ctrl-D
const KEY_INTERRUPT = "\u0003"; // Ctrl-C
const KEY_BACKSPACE_DEL = "\u007f";
const KEY_BACKSPACE = "\b";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Line-buffered, echoed prompt for non-secret fields (name, email). */
async function promptText(rl: readline.Interface, question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

/** Reads a line from stdin without echoing it — used for the password fields only. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const isTTY = Boolean(stdin.isTTY);

    stdout.write(question);
    let input = "";

    stdin.resume();
    stdin.setEncoding("utf8");
    if (isTTY) stdin.setRawMode(true);

    function cleanup() {
      stdin.removeListener("data", onData);
      if (isTTY) stdin.setRawMode(false);
      stdin.pause();
    }

    // Iterate per character rather than trusting one 'data' event == one
    // keystroke — in raw TTY mode that's usually true, but piped/pasted
    // input can deliver several characters (including the terminating
    // newline) in a single chunk.
    function onData(chunk: string) {
      for (const char of chunk.toString()) {
        if (KEY_ENTER.has(char) || char === KEY_EOF) {
          cleanup();
          stdout.write("\n");
          resolve(input);
          return;
        }

        if (char === KEY_INTERRUPT) {
          cleanup();
          stdout.write("\n");
          reject(new Error("Operación cancelada."));
          return;
        }

        if (char === KEY_BACKSPACE_DEL || char === KEY_BACKSPACE) {
          if (input.length > 0) {
            input = input.slice(0, -1);
            if (isTTY) stdout.write("\b \b");
          }
          continue;
        }

        input += char;
        if (isTTY) stdout.write("*");
      }
    }

    stdin.on("data", onData);
  });
}

async function promptRequiredText(rl: readline.Interface, question: string): Promise<string> {
  for (;;) {
    const value = await promptText(rl, question);
    if (value) return value;
    console.log("Este campo es obligatorio.");
  }
}

async function promptEmail(rl: readline.Interface): Promise<string> {
  for (;;) {
    const value = await promptText(rl, "Correo electrónico: ");
    const parsed = EMAIL_SCHEMA.safeParse(value);
    if (parsed.success) return parsed.data.toLowerCase();
    console.log(parsed.error.issues[0]?.message ?? "Correo no válido.");
  }
}

async function promptPassword(): Promise<string> {
  for (;;) {
    const password = await promptHidden("Contraseña (mínimo 12 caracteres): ");
    if (password.length >= MIN_PASSWORD_LENGTH) {
      const confirmation = await promptHidden("Confirma la contraseña: ");
      if (password === confirmation) return password;
      console.log("Las contraseñas no coinciden. Inténtalo de nuevo.\n");
      continue;
    }
    console.log(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.\n`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail(
      "No se encontró DATABASE_URL. Configúrala en .env.production.local o expórtala en el entorno antes de ejecutar este comando."
    );
  }

  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { email: true },
    });

    if (existingSuperAdmin) {
      console.log("Ya existe una cuenta SUPER_ADMIN. No se ha creado ninguna cuenta nueva.");
      console.log(existingSuperAdmin.email);
      process.exitCode = 1;
      return;
    }

    console.log("Configuración de la cuenta SUPER_ADMIN de producción.\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let name: string;
    let email: string;
    try {
      name = await promptRequiredText(rl, "Nombre del administrador: ");
      email = await promptEmail(rl);
    } finally {
      rl.close();
    }

    const password = await promptPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { name, passwordHash, role: "SUPER_ADMIN", isSuspended: false },
      });
    } else {
      await prisma.user.create({
        data: { name, email, passwordHash, role: "SUPER_ADMIN" },
      });
    }

    console.log("\nCuenta SUPER_ADMIN creada correctamente.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error inesperado al crear la cuenta SUPER_ADMIN.");
  process.exitCode = 1;
});

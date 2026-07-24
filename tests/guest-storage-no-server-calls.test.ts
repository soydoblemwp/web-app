import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GUEST_STORAGE_DIR = path.resolve(__dirname, "../src/lib/guest-storage");

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(dir, f));
}

describe("guest-storage never talks to a server", () => {
  const files = listTsFiles(GUEST_STORAGE_DIR);

  it("found the expected guest-storage modules", () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(
      expect.arrayContaining([
        "types.ts",
        "db.ts",
        "projects.ts",
        "history.ts",
        "library.ts",
        "campaigns.ts",
        "calendar.ts",
        "automations.ts",
        "brand-kit.ts",
        "export.ts",
      ])
    );
  });

  it.each(files.map((f) => [path.basename(f), f] as const))(
    "%s never imports Prisma, a server action, or next/server",
    (_name, file) => {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/@\/lib\/db\/prisma/);
      expect(content).not.toMatch(/@\/generated\/prisma/);
      expect(content).not.toMatch(/@\/server\/actions/);
      expect(content).not.toMatch(/"use server"/);
      expect(content).not.toMatch(/next\/server/);
      expect(content).not.toMatch(/DATABASE_URL/);
    }
  );

  it("only monitors.ts calls fetch() — and only to the user-supplied target URL, never to this app's own server", () => {
    for (const file of files) {
      const name = path.basename(file);
      const content = readFileSync(file, "utf8");
      const usesFetch = /\bfetch\(/.test(content);
      if (name === "monitors.ts") {
        expect(usesFetch).toBe(true);
        expect(content).toMatch(/fetch\(monitor\.url/);
      } else {
        expect(usesFetch).toBe(false);
      }
    }
  });
});

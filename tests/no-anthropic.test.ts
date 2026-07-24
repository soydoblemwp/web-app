import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "out", "build", "coverage"]);
// Only the live schema, not prisma/migrations: applied migrations are an
// immutable historical log (editing them breaks Prisma's checksums), and the
// dropped enum value's own name is unavoidably mentioned in the migration
// that removes it. src/ and the current schema are what must be clean.
const SCAN_TARGETS = ["src", "prisma/schema.prisma"];

const FORBIDDEN_PATTERNS = [
  /ANTHROPIC_API_KEY/,
  /api\.anthropic\.com/i,
  /AnthropicProvider/,
  /getAnthropicApiKey/,
  /isAnthropicConfigured/,
  /@anthropic-ai\/sdk/,
  // Word-boundary "ANTHROPIC"/"Anthropic" anywhere, but not as a substring of
  // an unrelated identifier — none exist in this codebase, so a plain match
  // is intentionally strict here.
  /anthropic/i,
];

function listFilesRecursively(target: string): string[] {
  const stat = statSync(target);
  if (!stat.isDirectory()) return [target];

  const entries = readdirSync(target);
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = path.join(target, entry);
    files.push(...listFilesRecursively(fullPath));
  }
  return files;
}

describe("no Anthropic / paid AI provider remnants", () => {
  it("finds zero references to Anthropic in src/ or the live prisma schema", () => {
    const offenders: string[] = [];
    for (const target of SCAN_TARGETS) {
      const files = listFilesRecursively(path.join(ROOT, target));
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(content)) {
            offenders.push(`${path.relative(ROOT, file)} matches ${pattern}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("package.json has no @anthropic-ai/sdk dependency", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(allDeps)).not.toContain("@anthropic-ai/sdk");
  });

  it(".env.example has no ANTHROPIC_API_KEY or other paid-AI-provider variables", () => {
    const envExample = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(envExample).not.toMatch(/ANTHROPIC/i);
    expect(envExample).not.toMatch(/AI_PROVIDER/);
    expect(envExample).not.toMatch(/OPENAI|GEMINI|GROQ|TOGETHER|OPENROUTER|HUGGINGFACE/i);
  });

});

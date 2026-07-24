import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

const AI_FORM_FILES = [
  "src/components/guest/guest-content-form.tsx",
  "src/components/guest/guest-ideas-form.tsx",
  "src/components/guest/guest-adapter-form.tsx",
  "src/components/guest/guest-reply-form.tsx",
  "src/components/content/generate-content-form.tsx",
  "src/components/content/content-adapter-form.tsx",
  "src/components/replies/generate-reply-form.tsx",
  "src/components/social/generate-social-ideas-form.tsx",
  "src/components/assistant/chat-panel.tsx",
];

const FORBIDDEN_IMPORTS = [
  "@/lib/ai/service",
  "@/lib/ai/guest-service",
  "@/server/actions/guest",
  "@anthropic-ai/sdk",
];

describe("every AI-generating form uses the local browser engine", () => {
  it.each(AI_FORM_FILES)("%s imports useLocalAI and no server-side AI module", (relativePath) => {
    const content = readFileSync(path.join(ROOT, relativePath), "utf8");

    expect(content).toContain("useLocalAI");
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(content).not.toContain(forbidden);
    }
    // No raw network call to build a request — all generation goes through
    // the shared local-engine hook, never fetch()/XHR to an AI endpoint.
    expect(content).not.toMatch(/fetch\(/);
  });

  it("the guest and registered save-only server actions never import a generation provider", () => {
    const actionFiles = [
      "src/server/actions/content.ts",
      "src/server/actions/reply.ts",
      "src/server/actions/assistant.ts",
    ];
    for (const relativePath of actionFiles) {
      const content = readFileSync(path.join(ROOT, relativePath), "utf8");
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(content).not.toContain(forbidden);
      }
      expect(content).not.toContain("@/lib/ai/local/engine");
      expect(content).not.toContain("@/lib/ai/local/worker");
    }
  });
});

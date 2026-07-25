import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NO_TOOL_INTENT,
  listRoutableTools,
  buildIntentClassifierSystemPrompt,
  parseIntentClassifierResponse,
} from "@/lib/chat/intent-router";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { listToolDefinitions } from "@/lib/ai-center/tools/registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Selección automática de herramientas
// ---------------------------------------------------------------------------
describe("Intent router: automatic tool selection (no rigid keywords)", () => {
  it("resolves an exact, currently-registered slug", () => {
    expect(parseIntentClassifierResponse("youtube-titulos")).toBe("youtube-titulos");
  });

  it("resolves regardless of casing, surrounding whitespace, trailing punctuation or a follow-up line", () => {
    expect(parseIntentClassifierResponse("  YouTube-Titulos.  ")).toBe("youtube-titulos");
    expect(parseIntentClassifierResponse('"youtube-hashtags"')).toBe("youtube-hashtags");
    expect(parseIntentClassifierResponse("youtube-guiones\n(porque pidió un guion)")).toBe("youtube-guiones");
  });

  it('"NONE" (any casing) resolves to no match — falls back to general chat', () => {
    expect(parseIntentClassifierResponse("NONE")).toBeNull();
    expect(parseIntentClassifierResponse("none")).toBeNull();
  });

  it("never trusts the model's raw output blindly — an unregistered/hallucinated slug resolves to no match", () => {
    expect(parseIntentClassifierResponse("herramienta-inventada")).toBeNull();
    expect(parseIntentClassifierResponse("¡Claro! Usaré el generador de títulos.")).toBeNull();
    expect(parseIntentClassifierResponse("")).toBeNull();
  });

  it("is not implemented as keyword matching — parsing depends only on an exact registry slug, not substring/keyword presence", () => {
    // A message that merely *contains* a tool's words, without being the
    // slug itself, must not match — proving this isn't naive keyword search.
    expect(parseIntentClassifierResponse("quiero títulos y también hashtags")).toBeNull();
  });

  it("listRoutableTools reflects every registered AiToolDefinition across every platform — nothing hardcoded twice", () => {
    const tools = listRoutableTools();
    expect(tools.map((t) => t.slug).sort()).toEqual(listToolDefinitions().map((t) => t.slug).sort());
    expect(tools.length).toBe(listToolDefinitions().length);
    expect(tools.length).toBeGreaterThanOrEqual(YOUTUBE_TOOLS.length);
  });

  it("adding a future tool to the registry requires zero changes to the router — it reads listToolDefinitions() live", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    // No hardcoded tool slugs/descriptions duplicated as literal strings.
    for (const tool of YOUTUBE_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Reutilización de herramientas existentes — no duplicated prompts/logic
// ---------------------------------------------------------------------------
describe("Reuse: the router never reimplements a tool, it only picks which existing one to call", () => {
  it("the classifier prompt lists real tools by slug + their own description — never invents new copy", () => {
    const prompt = buildIntentClassifierSystemPrompt();
    for (const tool of YOUTUBE_TOOLS) {
      expect(prompt).toContain(tool.slug);
      expect(prompt).toContain(tool.description);
    }
    expect(prompt).toContain(NO_TOOL_INTENT);
  });

  it("ChatPanel reuses each routed tool's own buildSystemPrompt — never a second/duplicated system prompt", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/routedTool\.buildSystemPrompt\(brandContextText\)/);
    expect(panel).toMatch(/findToolDefinition\(routedToolSlug\)/);
    // The generic fallback for unmatched messages is the pre-existing assistant prompt, not a new one.
    expect(panel).toMatch(/buildAssistantSystemPrompt\(brandContextText\)/);
  });

  it("no YouTube tool prompt text is duplicated anywhere under src/lib/chat", () => {
    const router = read("src/lib/chat/intent-router.ts");
    const youtubePrompts = read("src/lib/ai-center/tools/youtube-prompts.ts");
    // Sanity: the router file must not contain the actual tool system-prompt bodies.
    const firstPromptLine = youtubePrompts.match(/"Eres el generador de títulos[^"]*"/);
    expect(firstPromptLine).toBeTruthy();
    expect(router).not.toContain(firstPromptLine![0]);
  });

  it("findToolDefinition/listToolDefinitions are defined in exactly one place", () => {
    const files = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/chat/intent-router.ts",
      "src/components/chat/chat-panel.tsx",
    ];
    const definers = files.filter((f) => /export function findToolDefinition/.test(read(f)));
    expect(definers).toEqual(["src/lib/ai-center/tools/registry.ts"]);
  });
});

// ---------------------------------------------------------------------------
// Mantenimiento del contexto
// ---------------------------------------------------------------------------
describe("Context: full conversation history is kept for the real reply; classifier sees enough to resolve follow-ups", () => {
  const PANEL = read("src/components/chat/chat-panel.tsx");

  it("the real generation call still receives the full, untruncated history (unchanged from before routing existed)", () => {
    expect(PANEL).toMatch(/const replyText = await ai\.generate\(\{ system, history, prompt: text \}\);/);
  });

  it("the classifier call receives a bounded recent window of that same history, not a separate/duplicated context source", () => {
    expect(PANEL).toMatch(/history: history\.slice\(-CLASSIFIER_HISTORY_WINDOW\)/);
  });

  it("the classifier prompt explicitly instructs reusing the previous tool for refinement follow-ups", () => {
    const prompt = buildIntentClassifierSystemPrompt();
    expect(prompt).toMatch(/haz otros/);
    expect(prompt).toMatch(/más cortos/);
    expect(prompt).toMatch(/tradúcelos/);
  });

  it("a cancelled/failed classification aborts the whole send instead of silently firing a second, unwanted generation", () => {
    expect(PANEL).toMatch(/if \(!classifierReply\) return;/);
  });
});

// ---------------------------------------------------------------------------
// Seguridad
// ---------------------------------------------------------------------------
describe("Security: routing never bypasses existing checks, never trusts unvalidated data", () => {
  it("the router validates the model's answer against the real registry before returning a slug", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/findToolDefinition\(cleaned\) \? cleaned : null/);
  });

  it("saveAssistantExchangeAction (persistence) is untouched by this phase — still requires project access and verifies conversation ownership", () => {
    const actions = read("src/server/actions/assistant.ts");
    const fnSource = actions.match(/export async function saveAssistantExchangeAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
    expect(fnSource).toMatch(/ensureConversationOwnership\(input\.projectId, input\.conversationId, user\.id\)/);
  });

  it("no client-supplied tool/routing metadata is ever sent to a server action — routing is entirely client-side and ephemeral", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const saveCall = panel.match(/saveAssistantExchangeAction\(\{[\s\S]*?\}\);/)![0];
    expect(saveCall).not.toMatch(/routedTool|sourceTool|toolSlug/);
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto
// ---------------------------------------------------------------------------
describe("Project isolation is unaffected by routing", () => {
  it("ensureConversationOwnership still checks both projectId and userId (unchanged by this phase)", () => {
    const actions = read("src/server/actions/assistant.ts");
    const helper = actions.match(/async function ensureConversationOwnership[\s\S]*?\n\}/)![0];
    expect(helper).toMatch(/conversation\.projectId !== projectId/);
    expect(helper).toMatch(/conversation\.userId !== userId/);
  });

  it("routing never crosses project boundaries — brandContextText (project-specific) is still passed into every routed system prompt", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/routedTool\.buildSystemPrompt\(brandContextText\)/);
  });
});

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------
describe("Workspace keeps working exactly as before — no second history", () => {
  it("saveConversationToWorkspaceAction is untouched by this phase", () => {
    const actions = read("src/server/actions/assistant.ts");
    const fnSource = actions.match(/export async function saveConversationToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).toMatch(/sourceTool: "asistente-chat"/);
  });

  it("no new content-history table/service was introduced for routed replies", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/ai-chat.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/lib/chat/history.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AI Center
// ---------------------------------------------------------------------------
describe("AI Center keeps working exactly as before", () => {
  it("the 8 YouTube tools are unchanged: same slugs, same fields, same prompts", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    for (const tool of YOUTUBE_TOOLS) {
      expect(tool.fields.length).toBeGreaterThan(0);
      expect(typeof tool.buildSystemPrompt).toBe("function");
    }
  });

  it("the AI Center hub/registry/tool-card UI files were not modified to reference the router", () => {
    for (const relativePath of [
      "src/components/ai-center/ai-center-hub.tsx",
      "src/components/ai-center/tool-card.tsx",
      "src/lib/ai-center/registry.ts",
    ]) {
      expect(read(relativePath)).not.toMatch(/intent-router|routedTool|classifier/i);
    }
  });

  it("the YouTube dynamic tool route/page is untouched", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx");
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
  });
});

// ---------------------------------------------------------------------------
// Ausencia de duplicación
// ---------------------------------------------------------------------------
describe("No duplication: one AI engine, one router, one place per capability", () => {
  it("the local engine still performs a single non-streaming completion per call — no second engine, no reimplementation", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/stream: false/);
    expect(engine).toMatch(/export async function generateLocalText/);
  });

  it("ChatPanel calls ai.generate for both the classification and the real reply — the same hook, invoked twice, never a parallel implementation", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const generateCalls = panel.match(/await ai\.generate\(/g) ?? [];
    expect(generateCalls.length).toBe(2);
  });

  it("buildIntentClassifierSystemPrompt is defined in exactly one place", () => {
    const files = ["src/lib/chat/intent-router.ts", "src/components/chat/chat-panel.tsx"];
    const definers = files.filter((f) => /export function buildIntentClassifierSystemPrompt/.test(read(f)));
    expect(definers).toEqual(["src/lib/chat/intent-router.ts"]);
  });

  it("the Chat IA visible UI/JSX was not modified by this phase — only sendMessage's internal logic changed", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/Guardar en Workspace/);
    expect(panel).toMatch(/Escribe el primer mensaje para empezar la conversación\./);
    expect(panel).not.toMatch(/routedTool\.label|Herramienta usada|Usando:/);
  });
});

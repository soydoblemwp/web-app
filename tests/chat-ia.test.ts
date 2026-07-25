import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";
import { parseResultBlocks, parseInlineSegments } from "@/lib/ai-workspace/blocks";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
describe("Sidebar: 'Chat IA' link", () => {
  it("appears exactly once in Principal, respects the generic projectId-based href mechanism", () => {
    const principal = projectNavGroups.find((g) => g.label === "Principal")!;
    const matches = principal.items.filter((i) => i.label === "Chat IA");
    expect(matches).toHaveLength(1);
    expect(matches[0].segment).toBe("chat");
  });

  it("appears exactly once across the whole nav tree", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Chat IA");
    expect(all).toHaveLength(1);
  });

  it("never appears in guest or admin navigation", () => {
    expect(guestNavGroups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("Chat IA");
    expect(adminNavItems.map((i) => i.label)).not.toContain("Chat IA");
  });

  it("Sidebar's generic href builder is untouched — no special-casing for /chat", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");
    expect(sidebar).toMatch(/const href = item\.segment \? `\$\{base\}\/\$\{item\.segment\}` : base;/);
    expect(sidebar).not.toMatch(/"\/dashboard\/.*\/chat"/);
  });

  it("is unreachable outside a project — only [projectId]/layout.tsx renders Sidebar", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/<Sidebar projectId=\{project\.id\} \/>/);
    expect(read("src/app/(dashboard)/dashboard/page.tsx")).not.toMatch(/Sidebar/);
  });
});

// ---------------------------------------------------------------------------
// Routes exist, protected by the same project layout guard
// ---------------------------------------------------------------------------
describe("Chat IA routes", () => {
  const ROUTE_ROOT = "src/app/(dashboard)/dashboard/[projectId]/chat";

  it("layout, index and [conversationId] pages exist", () => {
    expect(existsSync(path.join(ROOT, `${ROUTE_ROOT}/layout.tsx`))).toBe(true);
    expect(existsSync(path.join(ROOT, `${ROUTE_ROOT}/page.tsx`))).toBe(true);
    expect(existsSync(path.join(ROOT, `${ROUTE_ROOT}/[conversationId]/page.tsx`))).toBe(true);
  });

  it("the project layout's membership guard still runs for every /chat/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("every chat route additionally calls requireProjectAccess itself (defense in depth, matching every other project route)", () => {
    for (const relativePath of [
      `${ROUTE_ROOT}/layout.tsx`,
      `${ROUTE_ROOT}/page.tsx`,
      `${ROUTE_ROOT}/[conversationId]/page.tsx`,
    ]) {
      expect(read(relativePath)).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
    }
  });

  it("the conversation page 404s instead of rendering when the conversation isn't found/owned", () => {
    const page = read(`${ROUTE_ROOT}/[conversationId]/page.tsx`);
    expect(page).toMatch(/if \(!conversation\) notFound\(\);/);
    expect(page).toMatch(/getConversationForProject\(projectId, conversationId, user\.id\)/);
  });
});

// ---------------------------------------------------------------------------
// Conversations: create / rename / delete / list, each per-project
// ---------------------------------------------------------------------------
describe("Conversations: create, rename, delete, list — always scoped to the owning project and user", () => {
  const ACTIONS = read("src/server/actions/assistant.ts");

  it("createChatConversationAction shares the same row-creation logic as the existing createConversationAction (no duplicated data logic)", () => {
    expect(ACTIONS).toMatch(/async function createConversationRow\(projectId: string, userId: string\)/);
    const createFn = ACTIONS.match(/export async function createConversationAction[\s\S]*?\n\}/)![0];
    const createChatFn = ACTIONS.match(/export async function createChatConversationAction[\s\S]*?\n\}/)![0];
    expect(createFn).toMatch(/createConversationRow\(projectId, user\.id\)/);
    expect(createChatFn).toMatch(/createConversationRow\(projectId, user\.id\)/);
    // Only the redirect target differs between the two entry points.
    expect(createFn).toMatch(/redirect\(`\/dashboard\/\$\{projectId\}\/assistant\/\$\{conversation\.id\}`\)/);
    expect(createChatFn).toMatch(/redirect\(`\/dashboard\/\$\{projectId\}\/chat\/\$\{conversation\.id\}`\)/);
  });

  it("rename and delete share one ownership-check helper — never trusting projectId/conversationId from the client alone", () => {
    expect(ACTIONS).toMatch(
      /async function ensureConversationOwnership\(projectId: string, conversationId: string, userId: string\)/
    );
    for (const fnName of ["renameConversationAction", "deleteConversationAction", "deleteChatConversationAction", "saveConversationToWorkspaceAction"]) {
      const fnSource = ACTIONS.match(new RegExp(`export async function ${fnName}[\\s\\S]*?\\n\\}`))![0];
      expect(fnSource).toMatch(/ensureConversationOwnership\(projectId, conversationId, user\.id\)/);
      expect(fnSource).toMatch(/if \(!conversation\) return/);
    }
  });

  it("ownership resolution checks projectId AND userId — never lets one project's editor rename/delete another user's or another project's conversation", () => {
    const helperSource = ACTIONS.match(/async function ensureConversationOwnership[\s\S]*?\n\}/)![0];
    expect(helperSource).toMatch(/conversation\.projectId !== projectId/);
    expect(helperSource).toMatch(/conversation\.userId !== userId/);
  });

  it("every conversation action requires at least EDITOR project access", () => {
    for (const fnName of [
      "createConversationAction",
      "createChatConversationAction",
      "renameConversationAction",
      "deleteConversationAction",
      "deleteChatConversationAction",
      "saveConversationToWorkspaceAction",
    ]) {
      const fnSource = ACTIONS.match(new RegExp(`export async function ${fnName}[\\s\\S]*?\\n\\}`))![0];
      expect(fnSource).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    }
  });

  it("listConversations (reused, untouched) stays scoped to projectId AND userId, ordered by last activity", () => {
    const service = read("src/server/services/assistant.ts");
    const fnSource = service.match(/export async function listConversations[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/where: \{ projectId, userId \}/);
    expect(fnSource).toMatch(/orderBy: \{ updatedAt: "desc" \}/);
  });

  it("getConversationForProject never returns a conversation belonging to a different project or user", () => {
    const service = read("src/server/services/assistant.ts");
    const fnSource = service.match(/export async function getConversationForProject[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/conversation\.projectId !== projectId/);
    expect(fnSource).toMatch(/conversation\.userId !== userId/);
  });

  it("ChatConversationList renders search, new-conversation, rename and delete — no submenu, no extra nav", () => {
    const list = read("src/components/chat/chat-conversation-list.tsx");
    expect(list).toMatch(/Buscar conversaciones/);
    expect(list).toMatch(/createChatConversationAction/);
    expect(list).toMatch(/renameConversationAction/);
    expect(list).toMatch(/deleteChatConversationAction/);
  });
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
describe("Messages: send, roles, context, persistence", () => {
  const ACTIONS = read("src/server/actions/assistant.ts");
  const PANEL = read("src/components/chat/chat-panel.tsx");

  it("saveAssistantExchangeAction (reused by Chat IA) verifies conversation ownership before writing either message", () => {
    const fnSource = ACTIONS.match(/export async function saveAssistantExchangeAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/ensureConversationOwnership\(input\.projectId, input\.conversationId, user\.id\)/);
    expect(fnSource).toMatch(/role: "user"/);
    expect(fnSource).toMatch(/role: "assistant"/);
  });

  it("ChatPanel keeps conversation context: full message history is sent with every generation", () => {
    expect(PANEL).toMatch(/const history = messages\.map/);
    expect(PANEL).toMatch(/ai\.generate\(\{ system, history, prompt: text \}\)/);
  });

  it("ChatPanel auto-scrolls to the latest message", () => {
    expect(PANEL).toMatch(/bottomRef\.current\?\.scrollIntoView/);
    expect(PANEL).toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[messages\]\);/);
  });

  it("ChatMessageBubble shows a per-message timestamp", () => {
    const bubble = read("src/components/chat/chat-message-bubble.tsx");
    expect(bubble).toMatch(/toLocaleTimeString/);
  });

  it("a cancelled/failed generation never persists an orphaned message", () => {
    expect(PANEL).toMatch(/if \(!replyText\) return;/);
  });
});

// ---------------------------------------------------------------------------
// Editor: auto-grow, Enter/Shift+Enter, send/stop
// ---------------------------------------------------------------------------
describe("Composer: Enter sends, Shift+Enter inserts a newline, stop cancels generation", () => {
  const COMPOSER = read("src/components/chat/chat-composer.tsx");

  it("Enter without Shift submits; Shift+Enter is left to the browser default (newline)", () => {
    const handler = COMPOSER.match(/function handleKeyDown[\s\S]*?\n  \}/)![0];
    expect(handler).toMatch(/event\.key === "Enter" && !event\.shiftKey/);
    expect(handler).toMatch(/event\.preventDefault\(\);/);
  });

  it("resizes itself as content grows, capped so it never grows unbounded", () => {
    expect(COMPOSER).toMatch(/el\.style\.height = "auto";/);
    expect(COMPOSER).toMatch(/Math\.min\(el\.scrollHeight, 240\)/);
  });

  it("swaps to a stop button while busy, reusing the existing ai.cancel() — no new cancellation mechanism", () => {
    expect(COMPOSER).toMatch(/busy \?/);
    expect(read("src/components/chat/chat-panel.tsx")).toMatch(/onStop=\{ai\.cancel\}/);
  });
});

// ---------------------------------------------------------------------------
// No second AI system
// ---------------------------------------------------------------------------
describe("Reuses the existing local AI engine — no second AI system", () => {
  const FORBIDDEN_IMPORTS = ["@/lib/ai/service", "@/lib/ai/guest-service", "@/server/actions/guest", "@anthropic-ai/sdk"];

  it("ChatPanel imports useLocalAI and none of the forbidden server-side AI modules", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/useLocalAI/);
    expect(panel).toMatch(/LocalAIStatusPanel/);
    for (const forbidden of FORBIDDEN_IMPORTS) expect(panel).not.toContain(forbidden);
    expect(panel).not.toMatch(/fetch\(/);
  });

  it("saveAssistantExchangeAction never imports a generation provider or the local engine directly", () => {
    const actions = read("src/server/actions/assistant.ts");
    for (const forbidden of FORBIDDEN_IMPORTS) expect(actions).not.toContain(forbidden);
    expect(actions).not.toContain("@/lib/ai/local/engine");
    expect(actions).not.toContain("@/lib/ai/local/worker");
  });

  it("streaming is not silently reinvented — engine.ts still awaits one full completion, with a documented seam for future streaming", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/stream: false/);
    expect(read("src/components/chat/chat-panel.tsx")).toMatch(/Streaming isn't available yet/);
  });
});

// ---------------------------------------------------------------------------
// Rich responses: reuses UniversalResultViewer, no second renderer
// ---------------------------------------------------------------------------
describe("Responses render through the single existing UniversalResultViewer — no second renderer", () => {
  it("ChatMessageBubble renders assistant messages via UniversalResultViewer + the shared parseResultBlocks", () => {
    const bubble = read("src/components/chat/chat-message-bubble.tsx");
    expect(bubble).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
    expect(bubble).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
  });

  it("parseResultBlocks is defined in exactly one place", () => {
    const files = [
      "src/lib/ai-workspace/blocks.ts",
      "src/components/chat/chat-message-bubble.tsx",
      "src/components/chat/chat-panel.tsx",
      "src/components/ai-center/generation/ai-generation-form.tsx",
    ];
    const definitions = files.filter((f) => read(f).includes("export function parseResultBlocks"));
    expect(definitions).toEqual(["src/lib/ai-workspace/blocks.ts"]);
  });

  it("supports code blocks, ordered/unordered lists and headings exactly as before (unchanged behavior)", () => {
    expect(parseResultBlocks("```js\nconst x = 1;\n```")).toEqual([{ kind: "code", language: "js", content: "const x = 1;" }]);
    expect(parseResultBlocks("- a\n- b")).toEqual([{ kind: "list", ordered: false, items: ["a", "b"] }]);
    expect(parseResultBlocks("# Título")).toEqual([{ kind: "heading", content: "Título" }]);
  });

  it("newly supports GFM tables", () => {
    const blocks = parseResultBlocks("| Nombre | Edad |\n| --- | --- |\n| Ana | 30 |\n| Luis | 25 |");
    expect(blocks).toEqual([
      {
        kind: "table",
        headers: ["Nombre", "Edad"],
        rows: [
          ["Ana", "30"],
          ["Luis", "25"],
        ],
      },
    ]);
  });

  it("newly supports blockquotes", () => {
    expect(parseResultBlocks("> Una cita importante")).toEqual([{ kind: "quote", content: "Una cita importante" }]);
  });

  it("newly supports markdown links and bare URLs via parseInlineSegments", () => {
    expect(parseInlineSegments("Visita [nuestro sitio](https://example.com) hoy")).toEqual([
      { type: "text", content: "Visita " },
      { type: "link", content: "nuestro sitio", href: "https://example.com" },
      { type: "text", content: " hoy" },
    ]);
    expect(parseInlineSegments("Más en https://example.com/docs por favor")).toEqual([
      { type: "text", content: "Más en " },
      { type: "link", content: "https://example.com/docs", href: "https://example.com/docs" },
      { type: "text", content: " por favor" },
    ]);
  });

  it("plain text with no links returns a single text segment (no regression for the common case)", () => {
    expect(parseInlineSegments("Texto normal sin enlaces")).toEqual([{ type: "text", content: "Texto normal sin enlaces" }]);
  });
});

// ---------------------------------------------------------------------------
// Workspace integration
// ---------------------------------------------------------------------------
describe("Guardar en Workspace: reuses ContentItem, no second history", () => {
  it("saveConversationToWorkspaceAction persists via prisma.contentItem.create, tagged with the existing 'asistente-chat' tool slug", () => {
    const actions = read("src/server/actions/assistant.ts");
    const fnSource = actions.match(/export async function saveConversationToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).toMatch(/sourceTool: "asistente-chat"/);
  });

  it("'asistente-chat' is the real, already-registered AI Center slug for the assistant tool (no invented slug)", () => {
    const registry = read("src/lib/ai-center/registry.ts");
    expect(registry).toMatch(/slug: "asistente-chat"/);
  });

  it("no new content-history table or service was introduced — the existing ContentItem/listContentItems stack is reused as-is", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/ai-chat.ts"))).toBe(false);
    const actions = read("src/server/actions/assistant.ts");
    expect(actions).not.toMatch(/prisma\.\w*[Cc]onversationHistory/);
  });
});

// ---------------------------------------------------------------------------
// No new tables/migrations
// ---------------------------------------------------------------------------
describe("Database: no new models or migrations this phase", () => {
  it("prisma/migrations still contains every migration created up to and including this phase", () => {
    // A later phase (Prompt Library) legitimately added its own migration —
    // this only asserts that everything up to this phase is still present.
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const expected of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
    ]) {
      expect(migrationDirs).toContain(expected);
    }
  });

  it("schema.prisma still has AIConversation/AIMessage — later phases (Prompt Library, AI Templates) added their own models on top, not in place of these", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model AIConversation \{/);
    expect(schema).toMatch(/model AIMessage \{/);
  });
});

// ---------------------------------------------------------------------------
// AI Center / Workspace / YouTube AI / Guest / Admin / auth untouched
// ---------------------------------------------------------------------------
describe("AI Center, Workspace, YouTube AI, Guest, Admin and auth keep working", () => {
  it("AI Center's own files were not modified to reference Chat IA", () => {
    for (const relativePath of [
      "src/lib/ai-center/registry.ts",
      "src/components/ai-center/ai-center-hub.tsx",
      "src/components/ai-center/tool-card.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/\/chat\b|ChatPanel|ChatComposer/);
    }
  });

  it("the theme system files were not modified this phase", () => {
    expect(read("src/components/providers/theme-provider.tsx")).not.toMatch(/chat/i);
    expect(read("src/components/layout/theme-toggle.tsx")).not.toMatch(/chat/i);
  });

  it("YouTube AI's 8 tools and dynamic route are untouched", () => {
    const registry = read("src/lib/ai-center/registry.ts");
    for (const slug of [
      "youtube-titulos",
      "youtube-descripciones",
      "youtube-hashtags",
      "youtube-etiquetas",
      "youtube-hooks",
      "youtube-capitulos",
      "youtube-ideas",
      "youtube-guiones",
    ]) {
      expect(registry).toContain(`slug: "${slug}"`);
    }
  });

  it("Workspace's own components were not modified to reference Chat IA", () => {
    for (const relativePath of [
      "src/components/workspace/ai-workspace-hub.tsx",
      "src/components/workspace/workspace-result-card.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/\/chat\b|ChatPanel|ChatComposer/);
    }
  });

  it("guest header/nav and admin layout have no reference to Chat IA", () => {
    expect(read("src/components/guest/guest-header.tsx")).not.toMatch(/Chat IA/);
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/Chat IA/);
  });

  it("auth config files were not touched", () => {
    for (const relativePath of ["src/lib/auth/config.ts", "src/lib/auth/edge-config.ts"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/chat/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Light/Dark/System + responsive
// ---------------------------------------------------------------------------
describe("Design: existing tokens only, responsive, no new UI library", () => {
  const CHAT_FILES = [
    "src/components/chat/chat-composer.tsx",
    "src/components/chat/chat-message-bubble.tsx",
    "src/components/chat/chat-panel.tsx",
    "src/components/chat/chat-conversation-list.tsx",
  ];

  it("no hardcoded hex colors — every color comes from existing design tokens", () => {
    for (const relativePath of CHAT_FILES) {
      expect(read(relativePath)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  it("no new UI/component library was introduced (only @/components/ui/* primitives used)", () => {
    for (const relativePath of CHAT_FILES) {
      const content = read(relativePath);
      expect(content).not.toMatch(/from "@radix-ui/);
      expect(content).not.toMatch(/from "@mui/);
      expect(content).not.toMatch(/from "antd/);
    }
  });

  it("globals.css was not touched this phase — no new tokens introduced", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-success: var(--success);");
    expect(css).not.toMatch(/--color-chat/);
  });

  it("the conversation list collapses responsively instead of using a separate mobile-only component", () => {
    const list = read("src/components/chat/chat-conversation-list.tsx");
    expect(list).toMatch(/hidden md:flex/);
  });
});

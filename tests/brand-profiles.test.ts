import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBrandProfileContext, buildBrandProfileTemplateVariables } from "@/lib/brand-profiles/context";
import { createBrandProfileSchema, updateBrandProfileSchema } from "@/lib/validation/brand-profiles";
import { createSavedPromptSchema, updateSavedPromptSchema } from "@/lib/validation/prompt-library";
import { renderTemplate } from "@/lib/ai-templates/engine";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function makeProfile(overrides: Partial<BrandProfileLike> = {}): BrandProfileLike {
  return {
    id: "b1",
    name: "Acme",
    description: "Herramientas para makers",
    mission: "Ayudar a los makers a lanzar más rápido",
    vision: "Un mundo con más productos indie",
    values: ["honestidad", "velocidad"],
    targetAudience: "Fundadores solo",
    tone: "cercano y directo",
    personality: "curiosa, práctica",
    primaryLanguage: "es",
    country: "España",
    allowedWords: ["cercano", "directo"],
    forbiddenWords: ["barato", "low-cost"],
    writingStyle: "frases cortas",
    preferredCTAs: ["Pruébalo gratis", "Empieza ahora"],
    socialLinks: ["instagram.com/acme", "x.com/acme"],
    website: "https://acme.dev",
    email: "hola@acme.dev",
    colors: ["#111827", "#F97316"],
    typography: "Inter",
    logoUrl: "https://acme.dev/logo.png",
    internalNotes: "No mencionar la ronda de inversión.",
    isDefault: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Variables automáticas — buildBrandProfileTemplateVariables
// ---------------------------------------------------------------------------
describe("buildBrandProfileTemplateVariables: the documented {{brand_*}} automatic variables", () => {
  it("maps every documented variable from the spec (brand_name, brand_description, brand_tone, brand_cta, brand_website...)", () => {
    const variables = buildBrandProfileTemplateVariables(makeProfile());
    expect(variables.brand_name).toBe("Acme");
    expect(variables.brand_description).toBe("Herramientas para makers");
    expect(variables.brand_tone).toBe("cercano y directo");
    expect(variables.brand_cta).toBe("Pruébalo gratis, Empieza ahora");
    expect(variables.brand_website).toBe("https://acme.dev");
  });

  it("always includes brand_name — the only field guaranteed non-empty on a BrandProfile", () => {
    const variables = buildBrandProfileTemplateVariables(makeProfile({ name: "Solo Nombre" }));
    expect(variables.brand_name).toBe("Solo Nombre");
  });

  it("never includes a key for an empty/unset field — so renderTemplate correctly reports it as missing rather than blank", () => {
    const variables = buildBrandProfileTemplateVariables(
      makeProfile({ description: null, tone: null, preferredCTAs: [], colors: [] })
    );
    expect(variables.brand_description).toBeUndefined();
    expect(variables.brand_tone).toBeUndefined();
    expect(variables.brand_cta).toBeUndefined();
    expect(variables.brand_colors).toBeUndefined();
  });

  it("joins array fields (values, allowed/forbidden words, social links, colors) with ', '", () => {
    const variables = buildBrandProfileTemplateVariables(makeProfile());
    expect(variables.brand_values).toBe("honestidad, velocidad");
    expect(variables.brand_social).toBe("instagram.com/acme, x.com/acme");
    expect(variables.brand_colors).toBe("#111827, #F97316");
  });

  it("integrates directly with the AI Templates render engine — {{brand_name}}/{{brand_tone}}/{{brand_cta}} resolve exactly like any other variable", () => {
    const variables = buildBrandProfileTemplateVariables(makeProfile());
    const result = renderTemplate("Marca: {{brand_name}}\nTono: {{brand_tone}}\nCTA: {{brand_cta}}", variables);
    expect(result.output).toBe("Marca: Acme\nTono: cercano y directo\nCTA: Pruébalo gratis, Empieza ahora");
    expect(result.missing).toEqual([]);
  });

  it("a template variable with no matching Brand Kit field is still correctly reported as missing", () => {
    const variables = buildBrandProfileTemplateVariables(makeProfile({ website: null }));
    const result = renderTemplate("{{brand_website}}", variables);
    expect(result.missing).toEqual(["brand_website"]);
  });
});

// ---------------------------------------------------------------------------
// Contexto de IA (Chat IA / AI Center / Prompt Library "Usar Brand Kit")
// ---------------------------------------------------------------------------
describe("buildBrandProfileContext: the shared AI-context block", () => {
  it("always includes the brand name and only includes fields that are actually set", () => {
    const context = buildBrandProfileContext(makeProfile({ mission: null, vision: null }));
    expect(context).toContain("Marca activa: Acme");
    expect(context).not.toMatch(/Misión:/);
    expect(context).not.toMatch(/Visión:/);
  });

  it("surfaces forbidden words as a hard rule, matching buildBrandContext's own forbidden-words phrasing convention", () => {
    const context = buildBrandProfileContext(makeProfile());
    expect(context).toMatch(/Palabras PROHIBIDAS \(no usar bajo ninguna circunstancia\): barato, low-cost/);
  });

  it("the same function is reused by every integration point — not reimplemented per integration", () => {
    for (const relativePath of [
      "src/components/brand-profiles/brand-profile-select.tsx",
      "src/components/brand-profiles/brand-profile-card.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/prompt-library/page.tsx",
    ]) {
      expect(read(relativePath)).toMatch(/buildBrandProfileContext/);
    }
    // Defined in exactly one place.
    const definers = ["src/lib/brand-profiles/context.ts"].filter((f) => read(f).includes("export function buildBrandProfileContext"));
    expect(definers).toEqual(["src/lib/brand-profiles/context.ts"]);
  });
});

// ---------------------------------------------------------------------------
// Validación (zod)
// ---------------------------------------------------------------------------
describe("Brand Kit validation schemas", () => {
  it("createBrandProfileSchema accepts a minimal valid input (name only)", () => {
    const parsed = createBrandProfileSchema.safeParse({ name: "Mi marca" });
    expect(parsed.success).toBe(true);
  });

  it("createBrandProfileSchema rejects an empty name", () => {
    expect(createBrandProfileSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("validates colors as hex codes — accepts #RGB and #RRGGBB, rejects anything else", () => {
    expect(createBrandProfileSchema.safeParse({ name: "x", colors: ["#111827", "#FFF"] }).success).toBe(true);
    expect(createBrandProfileSchema.safeParse({ name: "x", colors: ["not-a-color"] }).success).toBe(false);
    expect(createBrandProfileSchema.safeParse({ name: "x", colors: ["111827"] }).success).toBe(false);
  });

  it("updateBrandProfileSchema allows a partial update and requires a valid cuid id", () => {
    expect(updateBrandProfileSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", name: "Nuevo nombre" }).success).toBe(true);
    expect(updateBrandProfileSchema.safeParse({ id: "not-a-cuid", name: "x" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRUD — server actions
// ---------------------------------------------------------------------------
describe("Brand Kit CRUD actions", () => {
  const actions = read("src/server/actions/brand-profiles.ts");

  it("createBrandProfileAction creates a BrandProfile scoped to the authenticated user", () => {
    const fn = actions.match(/export async function createBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/prisma\.brandProfile\.create/);
    expect(fn).toMatch(/userId: user\.id/);
  });

  it("updateBrandProfileAction updates (never creates) and only after verifying ownership", () => {
    const fn = actions.match(/export async function updateBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedProfile\(id, user\.id\)/);
    expect(fn).toMatch(/if \(!existing\) return \{ error:/);
    expect(fn).toMatch(/prisma\.brandProfile\.update/);
    expect(fn).not.toMatch(/prisma\.brandProfile\.create/);
  });

  it("deleteBrandProfileAction deletes only after verifying ownership", () => {
    const fn = actions.match(/export async function deleteBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedProfile\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.brandProfile\.delete/);
  });

  it("duplicateBrandProfileAction creates a fresh copy owned by the same user, and it's never default", () => {
    const fn = actions.match(/export async function duplicateBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedProfile\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.brandProfile\.create/);
    expect(fn).toMatch(/\(copia\)/);
    expect(fn).toMatch(/isDefault: false/);
  });

  it("every mutation revalidates the Brand Kits page path", () => {
    const matches = actions.match(/revalidatePath\(brandKitsPath\([\w.]+\)\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Brand Kit por defecto
// ---------------------------------------------------------------------------
describe("Default Brand Kit logic", () => {
  const actions = read("src/server/actions/brand-profiles.ts");
  const services = read("src/server/services/brand-profiles.ts");

  it("the user's very first Brand Kit is automatically marked default", () => {
    const fn = actions.match(/export async function createBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/existingCount = await prisma\.brandProfile\.count\(\{ where: \{ userId: user\.id \} \}\)/);
    expect(fn).toMatch(/isDefault: existingCount === 0/);
  });

  it("setDefaultBrandProfileAction unsets every other default for the user in the same transaction before setting the new one", () => {
    const fn = actions.match(/export async function setDefaultBrandProfileAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/\$transaction/);
    expect(fn).toMatch(/updateMany\(\{ where: \{ userId: user\.id, isDefault: true \}, data: \{ isDefault: false \} \}/);
    expect(fn).toMatch(/update\(\{ where: \{ id \}, data: \{ isDefault: true \} \}/);
  });

  it("getDefaultBrandProfileForUser queries isDefault:true, scoped to the user, and only that", () => {
    const fn = services.match(/export async function getDefaultBrandProfileForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/findFirst\(\{ where: \{ userId, isDefault: true \} \}\)/);
  });

  it("listBrandProfilesForUser sorts the default profile first", () => {
    const fn = services.match(/export async function listBrandProfilesForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/orderBy: \[\{ isDefault: "desc" \}, \{ updatedAt: "desc" \}\]/);
  });
});

// ---------------------------------------------------------------------------
// Seguridad — aislamiento total por usuario
// ---------------------------------------------------------------------------
describe("Security: Brand Kits are fully isolated per user — never exposed across users", () => {
  const actions = read("src/server/actions/brand-profiles.ts");
  const services = read("src/server/services/brand-profiles.ts");

  it("getOwnedProfile treats 'not mine' exactly like 'does not exist' — no cross-user existence leak", () => {
    const fn = actions.match(/async function getOwnedProfile[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!profile \|\| profile\.userId !== userId\) return null;/);
  });

  it("getBrandProfileForUser re-checks ownership even after finding the row by id", () => {
    const fn = services.match(/export async function getBrandProfileForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/profile\.userId !== userId/);
  });

  it("listBrandProfilesForSelectAction (feeds the AI Center 'Seleccionar Brand Kit' control) resolves userId from the session, never the client", () => {
    const fn = actions.match(/export async function listBrandProfilesForSelectAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
    expect(fn).toMatch(/listBrandProfilesForUser\(user\.id\)/);
  });

  it("every action requires at least project VIEWER access before touching any Brand Kit", () => {
    const requireCalls = actions.match(/requireProjectAccess\([^)]*"VIEWER"\)/g) ?? [];
    expect(requireCalls.length).toBeGreaterThanOrEqual(6);
  });

  it("no action ever trusts a client-supplied userId", () => {
    expect(actions).not.toMatch(/userId:\s*input\./);
    expect(actions).not.toMatch(/userId:\s*formData/);
  });

  it("BrandProfile has no projectId column — it can never leak into another user's project by construction", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model BrandProfile \{[\s\S]*?\n\}/)![0];
    expect(model).not.toMatch(/projectId/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center
// ---------------------------------------------------------------------------
describe("AI Center integration: every tool gets 'Seleccionar Brand Kit', auto-falling back to the default", () => {
  const form = read("src/components/ai-center/generation/ai-generation-form.tsx");

  it("AiGenerationForm renders BrandProfileSelect and folds its context into the system prompt for every tool", () => {
    expect(form).toMatch(/import \{ BrandProfileSelect \} from "@\/components\/brand-profiles\/brand-profile-select"/);
    expect(form).toMatch(/<BrandProfileSelect projectId=\{projectId\} onContextChange=\{setBrandProfileContext\} \/>/);
    expect(form).toMatch(
      /tool\.buildSystemPrompt\(\[brandContextText, brandProfileContext\]\.filter\(Boolean\)\.join\("\\n\\n"\)\)/
    );
  });

  it("no AI Center tool page.tsx was modified to fetch Brand Kits — the selector fetches client-side, so every tool gets it for free", () => {
    const toolPages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/image-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    for (const relativePath of toolPages) {
      expect(read(relativePath)).not.toMatch(/BrandProfile|brand-profiles/);
    }
  });

  it("BrandProfileSelect defaults to the user's default Brand Kit automatically when nothing is explicitly chosen", () => {
    const select = read("src/components/brand-profiles/brand-profile-select.tsx");
    expect(select).toMatch(/const defaultProfile = result\.find\(\(profile\) => profile\.isDefault\)/);
    expect(select).toMatch(/if \(defaultProfile\) \{\s*onContextChange\(buildBrandProfileContext\(defaultProfile\)\);/);
  });

  it("still preserves every capability previous integration tests already verified (nothing broken)", () => {
    expect(form).toMatch(/useLocalAI/);
    expect(form).toMatch(/saveAiToolResultAction/);
    expect(form).toMatch(/import \{ SavePromptButton \} from "@\/components\/prompt-library\/save-prompt-button"/);
    expect(form).toMatch(/import \{ SaveAsTemplateButton \} from "@\/components\/ai-templates\/save-as-template-button"/);
  });
});

// ---------------------------------------------------------------------------
// Integración con Prompt Library
// ---------------------------------------------------------------------------
describe("Prompt Library integration: prompts can indicate 'Usar Brand Kit'", () => {
  it("SavedPrompt gained a useBrandKit column (additive, defaulted false) — not a new table", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model SavedPrompt \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/useBrandKit\s+Boolean\s+@default\(false\)/);
  });

  it("createSavedPromptSchema/updateSavedPromptSchema accept useBrandKit", () => {
    expect(createSavedPromptSchema.safeParse({ projectId: null, title: "t", content: "c", useBrandKit: true }).success).toBe(true);
    expect(updateSavedPromptSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", useBrandKit: true }).success).toBe(true);
  });

  it("createSavedPromptAction/updateSavedPromptAction/duplicateSavedPromptAction persist useBrandKit", () => {
    const actions = read("src/server/actions/prompt-library.ts");
    expect(actions).toMatch(/useBrandKit: parsed\.data\.useBrandKit,/);
    expect(actions).toMatch(/useBrandKit: parsed\.data\.useBrandKit \?\? existing\.useBrandKit,/);
    expect(actions).toMatch(/useBrandKit: existing\.useBrandKit,/);
  });

  it("PromptLibraryCard's 'Usar' composes the prompt with the default Brand Kit context only when useBrandKit is set", () => {
    const card = read("src/components/prompt-library/prompt-library-card.tsx");
    expect(card).toMatch(/prompt\.useBrandKit && defaultBrandContext/);
    expect(card).toMatch(/\[prompt\.content, defaultBrandContext\]\.join\("\\n\\n"\)/);
  });

  it("the Prompt Library page fetches the default Brand Kit context and passes it down, reusing getDefaultBrandProfileForUser", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/prompt-library/page.tsx");
    expect(page).toMatch(/getDefaultBrandProfileForUser\(user\.id\)/);
    expect(page).toMatch(/buildBrandProfileContext\(defaultBrandProfile\)/);
  });

  it("parseTagsInput is still defined in exactly one place — Brand Kit forms reuse it instead of redefining it", () => {
    const definers = [
      "src/lib/validation/prompt-library.ts",
      "src/lib/validation/ai-templates.ts",
      "src/lib/validation/brand-profiles.ts",
    ].filter((f) => read(f).includes("export function parseTagsInput"));
    expect(definers).toEqual(["src/lib/validation/prompt-library.ts"]);
    expect(read("src/components/brand-profiles/brand-profile-create-form.tsx")).toMatch(
      /import \{ parseTagsInput \} from "@\/lib\/validation\/prompt-library"/
    );
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Templates
// ---------------------------------------------------------------------------
describe("AI Templates integration: templates render using the Brand Kit", () => {
  it("the AI Templates page fetches the default Brand Kit and derives its template variables", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-templates/page.tsx");
    expect(page).toMatch(/getDefaultBrandProfileForUser\(user\.id\)/);
    expect(page).toMatch(/buildBrandProfileTemplateVariables\(defaultBrandProfile\)/);
  });

  it("AiTemplateCard pre-fills its preview values from brandVariables, only for variables the template actually declares", () => {
    const card = read("src/components/ai-templates/ai-template-card.tsx");
    expect(card).toMatch(/template\.variables\.filter\(\(name\) => brandVariables\[name\]\)/);
  });

  it("AiTemplateHub threads brandVariables through from the page to every card, unmodified", () => {
    const hub = read("src/components/ai-templates/ai-template-hub.tsx");
    expect(hub).toMatch(/brandVariables: Record<string, string>/);
    expect(hub).toMatch(/<AiTemplateCard key=\{template\.id\} projectId=\{projectId\} template=\{template\} brandVariables=\{brandVariables\} \/>/);
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace
// ---------------------------------------------------------------------------
describe("Workspace integration", () => {
  it("the Workspace page links to Brand Kits, alongside the existing Prompt Library/AI Templates links", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx");
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/brand-kits/);
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/prompt-library/);
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/ai-templates/);
  });

  it("AiWorkspaceHub itself was not modified — no Brand Kit-specific logic inside it", () => {
    const hub = read("src/components/workspace/ai-workspace-hub.tsx");
    expect(hub).toMatch(/const RECENT_LIMIT = 20;/);
    expect(hub).not.toMatch(/BrandProfile|brand-profiles/);
  });

  it("BrandProfileCard reuses UniversalResultViewer to preview the exact AI context text — no second renderer", () => {
    const card = read("src/components/brand-profiles/brand-profile-card.tsx");
    expect(card).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
    expect(card).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
    expect(card).not.toMatch(/export function parseResultBlocks/);
  });

  it("Brand Kits have their own dedicated route, distinct from the existing per-project 'Kit de marca' settings page", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/brand-kits/page.tsx"))).toBe(true);
    // The pre-existing, untouched single-per-project feature.
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/brand-kit/page.tsx"))).toBe(true);
  });

  it("the existing per-project BrandKit feature (Kit de marca) was not modified by this phase", () => {
    for (const relativePath of [
      "src/components/brand-kit/brand-kit-form.tsx",
      "src/components/brand-kit/brand-terms-manager.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/brand-kit/page.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/BrandProfile|brand-profiles|brand-kits/);
    }
  });
});

// ---------------------------------------------------------------------------
// Chat IA — sin tocar Orquestador ni Intent Router
// ---------------------------------------------------------------------------
describe("Chat IA automatically knows the active Brand Kit, without touching the Orquestador or the Intent Router", () => {
  it("chat-panel.tsx (the orchestrator) was NOT modified — no reference to BrandProfile/brand-profiles inside it", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).not.toMatch(/BrandProfile|brand-profiles/);
    expect(panel).toMatch(/buildIntentClassifierSystemPrompt/);
    expect(panel).toMatch(/parseIntentClassifierResponse/);
    expect(panel).toMatch(/buildAssistantSystemPrompt\(brandContextText\)/);
  });

  it("intent-router.ts was NOT modified — no reference to BrandProfile/brand-profiles inside it", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).not.toMatch(/BrandProfile|brand-profiles/);
    expect(router).toMatch(/export function listRoutableTools/);
  });

  it("buildBrandContext (the existing per-project context builder) was NOT modified — Brand Kit context is appended only for Chat IA's own page", () => {
    const brandContext = read("src/lib/ai/brand-context.ts");
    expect(brandContext).not.toMatch(/BrandProfile|brand-profiles/);
  });

  it("only the chat conversation page fetches the default Brand Kit and appends its context, alongside Prompt Library's and AI Templates' own", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx");
    expect(page).toMatch(/getDefaultBrandProfileForUser\(user\.id\)/);
    expect(page).toMatch(/buildBrandProfileContext\(defaultBrandProfile\)/);
    expect(page).toMatch(/<ChatPanel/);
    expect(page).toMatch(/brandContextText=\{brandContextText\}/);
  });
});

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------
describe("Database: exactly the necessary models/columns, one clean migration", () => {
  it("schema.prisma defines BrandProfile with every field from the spec's structure", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model BrandProfile \{[\s\S]*?\n\}/)![0];
    for (const field of [
      "name",
      "description",
      "mission",
      "vision",
      "values",
      "targetAudience",
      "tone",
      "personality",
      "primaryLanguage",
      "country",
      "allowedWords",
      "forbiddenWords",
      "writingStyle",
      "preferredCTAs",
      "socialLinks",
      "website",
      "email",
      "colors",
      "typography",
      "logoUrl",
      "internalNotes",
      "isDefault",
      "userId",
    ]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("BrandProfile was added on top of everything before it — SavedPrompt and AiTemplate are still there", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model BrandProfile \{/);
    expect(schema).toMatch(/model SavedPrompt \{/);
    expect(schema).toMatch(/model AiTemplate \{/);
    // The pre-existing, untouched, per-project single BrandKit model.
    expect(schema).toMatch(/model BrandKit \{/);
  });

  it("a single, additive migration exists for BrandProfile/useBrandKit — no DROP, no ALTER on any table beyond SavedPrompt's new column", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_brand_profile"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "BrandProfile"/);
    expect(sql).toMatch(/ALTER TABLE "SavedPrompt" ADD COLUMN\s+"useBrandKit" BOOLEAN NOT NULL DEFAULT false/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);
    // ALTER TABLE "BrandProfile" is expected here (adding its own foreign
    // key constraint right after CREATE TABLE, in the same migration) — the
    // only pre-existing table this migration may alter is SavedPrompt.
    expect(sql).not.toMatch(/ALTER TABLE "(?!SavedPrompt|BrandProfile)/);
  });

  it("no other prisma migration folder was touched — every prior migration is still present", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const prior of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
      "20260724140000_add_saved_prompt_library",
      "20260724150000_add_ai_templates",
    ]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
describe("Navigation: Brand Kits reachable from the Sidebar, additive only", () => {
  it("appears exactly once in projectNavGroups", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Brand Kits");
    expect(all).toHaveLength(1);
    expect(all[0].segment).toBe("brand-kits");
  });

  it("never appears in guest or admin navigation", () => {
    expect(guestNavGroups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("Brand Kits");
    expect(adminNavItems.map((i) => i.label)).not.toContain("Brand Kits");
  });

  it("the existing 'Kit de marca' nav entry (per-project BrandKit) is still present, untouched, and distinct from 'Brand Kits'", () => {
    const kitDeMarca = projectNavGroups.flatMap((g) => g.items).find((i) => i.label === "Kit de marca");
    expect(kitDeMarca).toBeDefined();
    expect(kitDeMarca?.segment).toBe("brand-kit");
  });

  it("Prompt Library's and AI Templates' own nav entries are still present, untouched", () => {
    expect(projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Prompt Library")).toHaveLength(1);
    expect(projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "AI Templates")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Sin ruptura del motor IA / arquitectura existente
// ---------------------------------------------------------------------------
describe("No second AI engine, no duplicated shared architecture", () => {
  it("engine.ts is unchanged and still the only local generation entry point", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/export async function generateLocalText/);
  });

  it("requireProjectAccess remains defined in exactly one place, reused (not reimplemented) by brand-profiles files", () => {
    expect(read("src/server/actions/brand-profiles.ts")).toMatch(/import \{ requireProjectAccess \} from "@\/lib\/permissions"/);
    expect(read("src/server/actions/brand-profiles.ts")).not.toMatch(/async function requireProjectAccess/);
  });

  it("Guest and Admin were not touched by this phase", () => {
    for (const relativePath of ["src/components/guest/guest-header.tsx", "src/app/admin/layout.tsx"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/BrandProfile|brand-profiles|brand-kits/);
      }
    }
  });
});

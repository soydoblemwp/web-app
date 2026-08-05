import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_CHANNELS, findCampaignChannel, campaignChannelLabel } from "@/lib/campaign-studio/channels";
import {
  CAMPAIGN_PIECE_STATUS_VALUES,
  CAMPAIGN_PIECE_STATUS_LABELS,
  CAMPAIGN_PIECE_PRIORITY_VALUES,
  isTerminalPieceStatus,
} from "@/lib/campaign-studio/piece-status";
import { CAMPAIGN_METRIC_TYPE_VALUES, CAMPAIGN_METRIC_TYPE_LABELS, computeMetricProgress } from "@/lib/campaign-studio/metrics";
import { computePillarPercentageTotal, isPillarPercentageBalanced } from "@/lib/campaign-studio/pillars";
import { shiftDate } from "@/lib/campaign-studio/date-shift";
import {
  buildCampaignStrategySystemPrompt,
  buildCampaignStrategyUserPrompt,
  parseCampaignStrategyText,
} from "@/lib/campaign-studio/strategy-ai";
import { buildCampaignPlanSystemPrompt, buildCampaignPlanUserPrompt, parseCampaignPlanText } from "@/lib/campaign-studio/plan-ai";
import { buildCampaignPillarSystemPrompt, parseCampaignPillarsText } from "@/lib/campaign-studio/pillar-ai";
import { campaignBriefingSchema, createCampaignPieceSchema, createCampaignPillarSchema } from "@/lib/validation/campaign-studio";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Channels — pure, real unit tests
// ---------------------------------------------------------------------------
describe("channels.ts: the 9 campaign channels from the wizard spec (pure, real unit tests)", () => {
  it("defines exactly Instagram, Facebook, TikTok, LinkedIn, YouTube, X, blog, email, newsletter", () => {
    expect(CAMPAIGN_CHANNELS.map((c) => c.id)).toEqual([
      "instagram",
      "facebook",
      "tiktok",
      "linkedin",
      "youtube",
      "x",
      "blog",
      "email",
      "newsletter",
    ]);
  });

  it("maps every social channel to a SocialPlatform enum value, and leaves blog/email/newsletter unmapped (they never become a SocialPost)", () => {
    const social = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "x"];
    for (const id of social) {
      expect(findCampaignChannel(id)?.socialPlatform).toBeTruthy();
    }
    for (const id of ["blog", "email", "newsletter"]) {
      expect(findCampaignChannel(id)?.socialPlatform).toBeUndefined();
    }
  });

  it("campaignChannelLabel falls back to the raw id for an unknown channel — never throws", () => {
    expect(campaignChannelLabel("instagram")).toBe("Instagram");
    expect(campaignChannelLabel("unknown-channel")).toBe("unknown-channel");
  });
});

// ---------------------------------------------------------------------------
// 2. Piece status / priority — pure, real unit tests
// ---------------------------------------------------------------------------
describe("piece-status.ts: the 8 Kanban states from the spec (pure, real unit tests)", () => {
  it("defines exactly Idea, Pendiente, En producción, En revisión, Aprobado, Programado, Publicado, Cancelado in that order", () => {
    expect(CAMPAIGN_PIECE_STATUS_VALUES).toEqual([
      "IDEA",
      "PENDING",
      "IN_PRODUCTION",
      "IN_REVIEW",
      "APPROVED",
      "SCHEDULED",
      "PUBLISHED",
      "CANCELLED",
    ]);
    expect(CAMPAIGN_PIECE_STATUS_LABELS.IDEA).toBe("Idea");
    expect(CAMPAIGN_PIECE_STATUS_LABELS.PENDING).toBe("Pendiente");
    expect(CAMPAIGN_PIECE_STATUS_LABELS.IN_PRODUCTION).toBe("En producción");
    expect(CAMPAIGN_PIECE_STATUS_LABELS.CANCELLED).toBe("Cancelado");
  });

  it("defines 4 priority levels", () => {
    expect(CAMPAIGN_PIECE_PRIORITY_VALUES).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
  });

  it("only PUBLISHED and CANCELLED are terminal states", () => {
    for (const status of CAMPAIGN_PIECE_STATUS_VALUES) {
      expect(isTerminalPieceStatus(status)).toBe(status === "PUBLISHED" || status === "CANCELLED");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Metrics — pure, real unit tests
// ---------------------------------------------------------------------------
describe("metrics.ts: target metrics + deterministic progress (pure, real unit tests)", () => {
  it("defines exactly the 11 metric types from the spec", () => {
    expect(CAMPAIGN_METRIC_TYPE_VALUES).toEqual([
      "REACH",
      "IMPRESSIONS",
      "CLICKS",
      "CONVERSIONS",
      "LEADS",
      "SALES",
      "ENGAGEMENT",
      "FOLLOWERS",
      "PLAYS",
      "OPEN_RATE",
      "CTR",
    ]);
    for (const type of CAMPAIGN_METRIC_TYPE_VALUES) {
      expect(CAMPAIGN_METRIC_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("computeMetricProgress reports 'no-target' for a zero/invalid target — never divides by zero", () => {
    expect(computeMetricProgress(0, 50)).toEqual({ percent: 0, status: "no-target" });
    expect(computeMetricProgress(-5, 50)).toEqual({ percent: 0, status: "no-target" });
  });

  it("computeMetricProgress classifies achieved/on-track/behind deterministically", () => {
    expect(computeMetricProgress(100, 100).status).toBe("achieved");
    expect(computeMetricProgress(100, 120).status).toBe("achieved");
    expect(computeMetricProgress(100, 70).status).toBe("on-track");
    expect(computeMetricProgress(100, 30).status).toBe("behind");
  });

  it("is a pure function — identical input always yields identical output", () => {
    expect(computeMetricProgress(200, 80)).toEqual(computeMetricProgress(200, 80));
  });
});

// ---------------------------------------------------------------------------
// 4. Pillars & percentages — pure, real unit tests
// ---------------------------------------------------------------------------
describe("pillars.ts: percentage total and the non-blocking warning (pure, real unit tests)", () => {
  it("sums percentages, treating unset (null) pillars as 0", () => {
    expect(computePillarPercentageTotal([{ id: "a", percentage: 40 }, { id: "b", percentage: 30 }])).toBe(70);
    expect(computePillarPercentageTotal([{ id: "a", percentage: 40 }, { id: "b", percentage: null }])).toBe(40);
  });

  it("is balanced when percentages sum to exactly 100", () => {
    expect(isPillarPercentageBalanced([{ id: "a", percentage: 60 }, { id: "b", percentage: 40 }])).toBe(true);
  });

  it("is unbalanced when percentages don't sum to 100 — but this is only ever a warning, never enforced", () => {
    expect(isPillarPercentageBalanced([{ id: "a", percentage: 60 }, { id: "b", percentage: 20 }])).toBe(false);
  });

  it("no pillars sized yet (all null) counts as balanced — nothing to warn about", () => {
    expect(isPillarPercentageBalanced([{ id: "a", percentage: null }])).toBe(true);
    expect(isPillarPercentageBalanced([])).toBe(true);
  });

  it("the pillar UI never disables its save action on imbalance — no 'disabled={!balanced}' anywhere", () => {
    const source = read("src/components/campaign-studio/tabs/pillars-tab.tsx");
    expect(source).not.toMatch(/disabled=\{!balanced\}/);
    expect(source).toMatch(/AlertTriangle/); // warns visually instead
  });
});

// ---------------------------------------------------------------------------
// 5. Date shifting (duplication / templates) — pure, real unit tests
// ---------------------------------------------------------------------------
describe("date-shift.ts: shiftDate recalculates dates relative to a new start (pure, real unit tests)", () => {
  it("preserves the offset from the original start date", () => {
    const originalStart = new Date("2026-01-01T00:00:00Z");
    const originalDate = new Date("2026-01-10T00:00:00Z"); // 9 days after start
    const newStart = new Date("2026-03-01T00:00:00Z");
    const result = shiftDate(originalDate, originalStart, newStart);
    expect(result.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("never returns the literal original date when the start date changes", () => {
    const originalStart = new Date("2026-01-01T00:00:00Z");
    const originalDate = new Date("2026-01-15T00:00:00Z");
    const newStart = new Date("2026-06-01T00:00:00Z");
    const result = shiftDate(originalDate, originalStart, newStart);
    expect(result.getTime()).not.toBe(originalDate.getTime());
  });
});

// ---------------------------------------------------------------------------
// 6. AI strategy generation — pure, real unit tests
// ---------------------------------------------------------------------------
describe("strategy-ai.ts: prompt building + deterministic parsing (pure, real unit tests, no AI in the parser itself)", () => {
  it("buildCampaignStrategySystemPrompt lists all 11 section markers by default", () => {
    const system = buildCampaignStrategySystemPrompt("");
    for (const marker of ["RESUMEN", "AUDIENCIA", "PROPUESTA_VALOR", "OBJETIVOS", "TEMAS", "ANGULOS", "CTA", "RIESGOS", "RECOMENDACIONES", "METRICAS"]) {
      expect(system).toContain(marker);
    }
  });

  it("buildCampaignStrategySystemPrompt can scope to a single section for individual regeneration", () => {
    const system = buildCampaignStrategySystemPrompt("", ["cta"]);
    expect(system).toContain("CTA:");
    expect(system).not.toContain("RESUMEN:");
  });

  it("buildCampaignStrategySystemPrompt appends brand context only when provided", () => {
    expect(buildCampaignStrategySystemPrompt("")).not.toMatch(/Contexto de marca/);
    expect(buildCampaignStrategySystemPrompt("Tono cercano.")).toMatch(/Contexto de marca/);
  });

  it("buildCampaignStrategyUserPrompt includes every provided field", () => {
    const prompt = buildCampaignStrategyUserPrompt({
      name: "Lanzamiento Q3",
      description: "desc",
      productOrService: "App",
      objective: "Vender más",
      audience: "PYMEs",
      valueProposition: "vp",
      mainMessage: "mm",
      offer: "20% off",
      tone: "cercano",
      channels: ["instagram", "email"],
    });
    expect(prompt).toContain("Lanzamiento Q3");
    expect(prompt).toContain("Vender más");
    expect(prompt).toContain("instagram, email");
  });

  it("parseCampaignStrategyText extracts paragraph sections", () => {
    const raw = "RESUMEN:\nEsta es la estrategia.\n\nAUDIENCIA:\nPerfil de audiencia aquí.\n";
    const parsed = parseCampaignStrategyText(raw);
    expect(parsed.summary).toBe("Esta es la estrategia.");
    expect(parsed.audienceProfile).toBe("Perfil de audiencia aquí.");
  });

  it("parseCampaignStrategyText extracts list sections, stripping bullets/numbering", () => {
    const raw = "OBJETIVOS:\n- Aumentar ventas\n2) Mejorar marca\nFidelizar\n";
    const parsed = parseCampaignStrategyText(raw);
    expect(parsed.objectives).toEqual(["Aumentar ventas", "Mejorar marca", "Fidelizar"]);
  });

  it("parseCampaignStrategyText never throws on malformed/empty input — missing sections just come back empty", () => {
    expect(() => parseCampaignStrategyText("")).not.toThrow();
    expect(() => parseCampaignStrategyText("texto libre sin marcadores")).not.toThrow();
    const parsed = parseCampaignStrategyText("no markers here");
    expect(parsed.summary).toBe("");
    expect(parsed.objectives).toEqual([]);
  });

  it("is a pure function — identical input always yields identical output", () => {
    const raw = "RESUMEN:\nA\n\nCTA:\nCompra ahora\n";
    expect(parseCampaignStrategyText(raw)).toEqual(parseCampaignStrategyText(raw));
  });
});

// ---------------------------------------------------------------------------
// 7. AI content-plan generation (piezas planificadas) — pure, real unit tests
// ---------------------------------------------------------------------------
describe("plan-ai.ts: content plan generation prompts + deterministic parser (pure, real unit tests)", () => {
  it("buildCampaignPlanUserPrompt requests the exact content count and date range", () => {
    const prompt = buildCampaignPlanUserPrompt({
      campaignName: "Campaña X",
      objective: "obj",
      audience: "aud",
      channels: ["instagram"],
      pillarNames: ["Educativo"],
      contentCount: 12,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(prompt).toContain("Genera exactamente 12 piezas.");
    expect(prompt).toContain("2026-01-01 a 2026-01-31");
  });

  it("buildCampaignPlanSystemPrompt documents the exact ---PIEZA---/---FIN--- block format", () => {
    const system = buildCampaignPlanSystemPrompt("");
    expect(system).toContain("---PIEZA---");
    expect(system).toContain("---FIN---");
    expect(system).toContain("TITULO:");
    expect(system).toContain("PLATAFORMA:");
  });

  it("parseCampaignPlanText extracts every field from a well-formed block", () => {
    const raw = [
      "---PIEZA---",
      "TITULO: Reel de bienvenida",
      "IDEA: Mostrar el producto en 15s",
      "PLATAFORMA: instagram",
      "FORMATO: reel",
      "PILAR: Educativo",
      "OBJETIVO: Awareness",
      "CTA: Síguenos",
      "FECHA: 2026-02-01",
      "HORA: 10:00",
      "PALABRAS_CLAVE: lanzamiento, producto",
      "NOTAS: Grabar en vertical",
      "---FIN---",
    ].join("\n");
    const drafts = parseCampaignPlanText(raw);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      title: "Reel de bienvenida",
      idea: "Mostrar el producto en 15s",
      platform: "instagram",
      format: "reel",
      pillarName: "Educativo",
      objective: "Awareness",
      cta: "Síguenos",
      date: "2026-02-01",
      time: "10:00",
      keywords: ["lanzamiento", "producto"],
      notes: "Grabar en vertical",
    });
  });

  it("parses multiple pieces from one response", () => {
    const raw = ["---PIEZA---", "TITULO: Uno", "PLATAFORMA: x", "---FIN---", "---PIEZA---", "TITULO: Dos", "PLATAFORMA: email", "---FIN---"].join("\n");
    expect(parseCampaignPlanText(raw)).toHaveLength(2);
  });

  it("silently drops a block missing título or plataforma instead of crashing", () => {
    const raw = ["---PIEZA---", "IDEA: solo idea, sin título ni plataforma", "---FIN---"].join("\n");
    expect(parseCampaignPlanText(raw)).toEqual([]);
  });

  it("never throws on empty/garbage input", () => {
    expect(() => parseCampaignPlanText("")).not.toThrow();
    expect(() => parseCampaignPlanText("respuesta libre del modelo sin el formato pedido")).not.toThrow();
    expect(parseCampaignPlanText("garbage")).toEqual([]);
  });

  it("parseKeyValueBlock is reused by pillar-ai.ts — one parser, not two", () => {
    const source = read("src/lib/campaign-studio/pillar-ai.ts");
    expect(source).toMatch(/import \{ parseKeyValueBlock \} from "@\/lib\/campaign-studio\/plan-ai"/);
  });
});

// ---------------------------------------------------------------------------
// 8. AI pillar generation — pure, real unit tests
// ---------------------------------------------------------------------------
describe("pillar-ai.ts: pillar generation prompt + deterministic parser (pure, real unit tests)", () => {
  it("system prompt asks for percentages summing to ~100 and the exact block format", () => {
    const system = buildCampaignPillarSystemPrompt("");
    expect(system).toMatch(/sumar aproximadamente 100/);
    expect(system).toContain("---PILAR---");
    expect(system).toContain("PORCENTAJE:");
  });

  it("parses a well-formed pillar block including numeric percentage and comma-separated lists", () => {
    const raw = [
      "---PILAR---",
      "NOMBRE: Educativo",
      "DESCRIPCION: Contenido que enseña",
      "OBJETIVO: Awareness",
      "PORCENTAJE: 40",
      "FORMATOS: reel, carrusel",
      "PLATAFORMAS: instagram, tiktok",
      "TEMAS: tips, tutoriales",
      "---FIN---",
    ].join("\n");
    const drafts = parseCampaignPillarsText(raw);
    expect(drafts).toEqual([
      {
        name: "Educativo",
        description: "Contenido que enseña",
        objective: "Awareness",
        percentage: 40,
        formats: ["reel", "carrusel"],
        platforms: ["instagram", "tiktok"],
        topics: ["tips", "tutoriales"],
      },
    ]);
  });

  it("a non-numeric or missing percentage parses to null, never NaN or a crash", () => {
    const raw = ["---PILAR---", "NOMBRE: Sin porcentaje", "---FIN---"].join("\n");
    const drafts = parseCampaignPillarsText(raw);
    expect(drafts[0].percentage).toBeNull();
  });

  it("drops a block with no nombre", () => {
    const raw = ["---PILAR---", "DESCRIPCION: sin nombre", "---FIN---"].join("\n");
    expect(parseCampaignPillarsText(raw)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9. Validation schemas — pure, real unit tests
// ---------------------------------------------------------------------------
describe("validation/campaign-studio.ts: zod schemas (pure, real unit tests)", () => {
  it("campaignBriefingSchema accepts a fully-empty object (every field optional, for progressive wizard autosave)", () => {
    expect(campaignBriefingSchema.safeParse({}).success).toBe(true);
  });

  it("campaignBriefingSchema rejects a name over 200 characters", () => {
    expect(campaignBriefingSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
  });

  it("createCampaignPieceSchema requires a non-empty title and platform", () => {
    expect(createCampaignPieceSchema.safeParse({ title: "", platform: "instagram" }).success).toBe(false);
    expect(createCampaignPieceSchema.safeParse({ title: "Pieza", platform: "" }).success).toBe(false);
    expect(createCampaignPieceSchema.safeParse({ title: "Pieza", platform: "instagram" }).success).toBe(true);
  });

  it("createCampaignPillarSchema constrains percentage to 0-100", () => {
    expect(createCampaignPillarSchema.safeParse({ name: "Pilar", percentage: 150 }).success).toBe(false);
    expect(createCampaignPillarSchema.safeParse({ name: "Pilar", percentage: -1 }).success).toBe(false);
    expect(createCampaignPillarSchema.safeParse({ name: "Pilar", percentage: 50 }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Campaign creation / briefing autosave — structural (DB-touching)
// ---------------------------------------------------------------------------
describe("campaign-studio.ts: campaign creation and briefing autosave (structural)", () => {
  const source = read("src/server/actions/campaign-studio.ts");

  it("createCampaignDraftAction starts every new campaign as DRAFT, owned by the current user", () => {
    const fn = source.match(/export async function createCampaignDraftAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    expect(fn).toMatch(/status: "DRAFT"/);
    expect(fn).toMatch(/ownerId: user\.id/);
  });

  it("updateCampaignBriefingAction only ever writes fields present in the patch — omitted fields are never reset to empty/default", () => {
    const fn = source.match(/export async function updateCampaignBriefingAction[\s\S]*?\n(?=export)/)![0];
    expect(fn).toMatch(/campaignBriefingSchema\.partial\(\)\.safeParse\(patch\)/);
    // every array/text field write is gated on `!== undefined`
    expect(fn).toMatch(/d\.audienceInterests !== undefined/);
    expect(fn).toMatch(/d\.channels !== undefined/);
    expect(fn).not.toMatch(/audienceInterests: d\.audienceInterests \?\? \[\]/);
  });

  it("updateCampaignBriefingAction never creates a version — briefing autosave is metadata-only, same reasoning as autosaveContentItemAction", () => {
    const fn = source.match(/export async function updateCampaignBriefingAction[\s\S]*?\n(?=export)/)![0];
    expect(fn).not.toMatch(/Version\.create/);
  });

  it("finalizeCampaignWizardAction only moves DRAFT -> PLANNED, never touches an already-finalized campaign's status", () => {
    const fn = source.match(/export async function finalizeCampaignWizardAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(campaign\.status === "DRAFT"\)/);
  });
});

// ---------------------------------------------------------------------------
// 11. Strategy generation persistence — structural
// ---------------------------------------------------------------------------
describe("campaign-studio.ts: saveCampaignStrategyAction stores structured sections, never one text blob (structural)", () => {
  const source = read("src/server/actions/campaign-studio.ts");
  const fn = source.match(/export async function saveCampaignStrategyAction[\s\S]*?\n(?=export|interface)/)![0];

  it("writes each section to its own field — summary, objectives, themes, creativeAngles, risks, recommendations, suggestedMetrics all appear as distinct keys", () => {
    for (const field of ["summary", "audienceProfile", "objectives", "themes", "creativeAngles", "risks", "recommendations", "suggestedMetrics"]) {
      expect(fn).toContain(`s.${field}`);
    }
  });

  it("optionally snapshots a CampaignStrategyVersion BEFORE overwriting — same point-in-time-snapshot pattern as ContentVersion", () => {
    expect(fn).toMatch(/if \(existing && input\.createVersion\)/);
    expect(fn).toMatch(/campaignStrategyVersion\.create/);
  });

  it("enforces project access and campaign ownership", () => {
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    expect(fn).toMatch(/getOwnedCampaign\(campaignId, projectId\)/);
  });
});

// ---------------------------------------------------------------------------
// 12. Pillars CRUD + reorder — structural
// ---------------------------------------------------------------------------
describe("campaign-pillars.ts: CRUD, reorder, AI bulk-save (structural)", () => {
  const source = read("src/server/actions/campaign-pillars.ts");

  it("every mutation validates the pillar belongs to the given campaign, not just any pillar id", () => {
    expect(source).toMatch(/async function getOwnedPillar\(pillarId: string, campaignId: string\)/);
    expect(source).toMatch(/pillar\.campaignId !== campaignId/);
  });

  it("reorderCampaignPillarsAction rejects an id that doesn't belong to this campaign before touching the database", () => {
    const fn = source.match(/export async function reorderCampaignPillarsAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!orderedIds\.every\(\(id\) => ownedIds\.has\(id\)\)\) return \{ error:/);
  });

  it("reorderCampaignPillarsAction persists the new order in a single transaction", () => {
    const fn = source.match(/export async function reorderCampaignPillarsAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.\$transaction\(/);
  });

  it("createCampaignPillarsFromDraftsAction bulk-saves AI drafts and refuses an empty draft list", () => {
    const fn = source.match(/export async function createCampaignPillarsFromDraftsAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(drafts\.length === 0\) return \{ error:/);
    expect(fn).toMatch(/createMany/);
  });
});

// ---------------------------------------------------------------------------
// 13. Planned pieces, Kanban order/status, relation to ContentItem — structural
// ---------------------------------------------------------------------------
describe("campaign-pieces.ts: pieces, Kanban persistence, and the ContentItem relation (structural)", () => {
  const source = read("src/server/actions/campaign-pieces.ts");

  it("moveCampaignPieceAction (Kanban drag) persists BOTH the new status column and the order within it", () => {
    const fn = source.match(/export async function moveCampaignPieceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/data: \{ status: input\.status, order: input\.order/);
  });

  it("createContentFromPieceAction creates a REAL ContentItem, never a second document model, and links it via CampaignContent (the existing join model) plus CampaignContentPiece.contentItemId", () => {
    const fn = source.match(/export async function createContentFromPieceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create\(/);
    expect(fn).toMatch(/prisma\.campaignContent\.create\(\{ data: \{ campaignId, contentItemId: contentItem\.id \} \}\)/);
    expect(fn).toMatch(/contentItemId: contentItem\.id/);
  });

  it("createContentFromPieceAction copies channel/objective/cta/keywords/brandProfileId from the piece/campaign onto the new ContentItem", () => {
    const fn = source.match(/export async function createContentFromPieceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/channel: piece\.platform/);
    expect(fn).toMatch(/objective: piece\.objective/);
    expect(fn).toMatch(/cta: piece\.cta/);
    expect(fn).toMatch(/keywords: piece\.keywords/);
    expect(fn).toMatch(/brandProfileId: campaign\.brandProfileId/);
  });

  it("createContentFromPieceAction refuses to create a second ContentItem for a piece that already has one", () => {
    const fn = source.match(/export async function createContentFromPieceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(piece\.contentItemId\) return \{ error:/);
  });

  it("every piece mutation checks the piece belongs to the given campaign (2-hop ownership: piece -> campaign -> project)", () => {
    expect(source).toMatch(/async function getOwnedPiece\(pieceId: string, campaignId: string\)/);
    expect((source.match(/getOwnedPiece\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("duplicateCampaignPieceAction and batchDuplicateCampaignPiecesAction never copy contentItemId, comments, or assignee — a duplicate is always a fresh planning item", () => {
    const dup = source.match(/export async function duplicateCampaignPieceAction[\s\S]*?\n\}/)![0];
    expect(dup).not.toMatch(/contentItemId: piece\.contentItemId/);
    expect(dup).not.toMatch(/assigneeId: piece\.assigneeId/);
    expect(dup).toMatch(/status: "IDEA"/);
  });
});

// ---------------------------------------------------------------------------
// 14. Batch generation — controlled, cancellable, per-item error handling
// ---------------------------------------------------------------------------
describe("batch-action-bar.tsx: batch draft generation is sequential, cancellable, and resilient to per-item failure (structural)", () => {
  const source = read("src/components/campaign-studio/batch-action-bar.tsx");

  it("generates drafts sequentially in a for-loop — never Promise.all/parallel requests", () => {
    expect(source).toMatch(/for \(const piece of targets\)/);
    expect(source).not.toMatch(/Promise\.all/);
  });

  it("checks a cancel flag every iteration and stops the loop when set", () => {
    expect(source).toMatch(/cancelledRef\.current = true/);
    expect(source).toMatch(/if \(cancelledRef\.current\) break;/);
  });

  it("skips pieces that already have a ContentItem — never a duplicate creation request", () => {
    expect(source).toMatch(/!p\.contentItemId/);
  });

  it("catches a per-piece error and continues the loop instead of aborting the whole batch", () => {
    expect(source).toMatch(/try \{[\s\S]*?\} catch \(err\) \{/);
    // the catch block records the error but the for-loop itself is not inside a try that would exit early
    const loopBlock = source.match(/for \(const piece of targets\) \{[\s\S]*?\n    \}/)![0];
    expect(loopBlock).toMatch(/catch \(err\)/);
  });

  it("shows a final summary (ok vs failed count) after the batch completes", () => {
    expect(source).toMatch(/correctas, .*con error/);
  });

  it("no alert\\(\\) or confirm\\(\\) is used anywhere — sonner toast instead", () => {
    expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
  });
});

// ---------------------------------------------------------------------------
// 15. Kanban board — drag persistence + optimistic rollback
// ---------------------------------------------------------------------------
describe("kanban-board.tsx: real drag-and-drop, optimistic update with rollback on failure (structural)", () => {
  const source = read("src/components/campaign-studio/kanban-board.tsx");

  it("uses native HTML5 drag events — no drag-and-drop library, no WebSockets", () => {
    expect(source).toMatch(/draggable/);
    expect(source).toMatch(/onDragStart/);
    expect(source).toMatch(/onDrop/);
    expect(source).not.toMatch(/new WebSocket\(|socket\.io/);
  });

  it("applies the move optimistically before the server call resolves", () => {
    expect(source).toMatch(/onPiecesChange\(optimistic\)/);
  });

  it("rolls back to the previous state if the server call fails", () => {
    const fn = source.match(/async function handleDrop[\s\S]*?\n  \}/)![0];
    expect(fn).toMatch(/if \(result\.error\) \{/);
    expect(fn).toMatch(/onPiecesChange\(previous\)/);
  });

  it("columns are generated from CAMPAIGN_PIECE_STATUS_VALUES — one source of truth for Kanban columns and the status filter dropdowns", () => {
    expect(source).toMatch(/CAMPAIGN_PIECE_STATUS_VALUES\.map/);
  });
});

// ---------------------------------------------------------------------------
// 16. Filters — Contenidos and Calendario tabs
// ---------------------------------------------------------------------------
describe("Contents/Calendar tabs: filtering by platform, pillar, status, priority, and responsable (structural)", () => {
  it("ContentsTab filters by platform, pillar, status, priority, and assignee simultaneously", () => {
    const source = read("src/components/campaign-studio/tabs/contents-tab.tsx");
    for (const filter of ["platformFilter", "pillarFilter", "statusFilter", "priorityFilter", "assigneeFilter"]) {
      expect(source).toContain(filter);
    }
  });

  it("CalendarTab filters by channel, pillar, status, and responsable", () => {
    const source = read("src/components/campaign-studio/tabs/calendar-tab.tsx");
    for (const filter of ["channelFilter", "pillarFilter", "statusFilter", "assigneeFilter"]) {
      expect(source).toContain(filter);
    }
  });

  it("CalendarTab supports month, week, and agenda views, plus drag-and-drop rescheduling", () => {
    const source = read("src/components/campaign-studio/tabs/calendar-tab.tsx");
    expect(source).toMatch(/"month"[\s\S]*"week"[\s\S]*"agenda"/);
    expect(source).toMatch(/draggable/);
    expect(source).toMatch(/onDrop/);
  });
});

// ---------------------------------------------------------------------------
// 17. Comments — internal, resolvable, mention-aware
// ---------------------------------------------------------------------------
describe("Comments: internal-only, resolvable, mention project members (structural)", () => {
  const source = read("src/server/actions/campaign-pieces.ts");

  it("createCampaignPieceCommentAction validates the piece belongs to the campaign before writing", () => {
    const fn = source.match(/export async function createCampaignPieceCommentAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPiece\(parsed\.data\.pieceId, campaignId\)/);
  });

  it("resolveCampaignPieceCommentAction toggles the resolved flag and verifies the comment belongs to this campaign's piece", () => {
    const fn = source.match(/export async function resolveCampaignPieceCommentAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/comment\.piece\.campaignId !== campaignId/);
    expect(fn).toMatch(/data: \{ resolved \}/);
  });

  it("no real-time chat/WebSocket implementation exists — comments are plain request/response", () => {
    expect(source).not.toMatch(/WebSocket|socket\.io|Pusher/);
  });

  it("mentions reuse the existing ProjectMember list — never a second user/membership system", () => {
    const schema = read("src/lib/validation/campaign-studio.ts");
    expect(schema).toMatch(/mentionedUserIds: z\.array\(z\.string\(\)\.cuid\(\)\)/);
    const teamAction = read("src/server/actions/campaign-team.ts");
    expect(teamAction).toMatch(/listProjectMembersForCampaignStudio/);
  });
});

// ---------------------------------------------------------------------------
// 18. Metric goals — CRUD, manual registration
// ---------------------------------------------------------------------------
describe("campaign-metrics.ts: target metrics, manual result registration (structural)", () => {
  const source = read("src/server/actions/campaign-metrics.ts");

  it("createCampaignMetricGoalAction upserts on the unique (campaignId, metricType) pair — defining the same metric twice updates it instead of erroring", () => {
    const fn = source.match(/export async function createCampaignMetricGoalAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/campaignMetricGoal\.upsert/);
    expect(fn).toMatch(/campaignId_metricType/);
  });

  it("updateCampaignMetricValueAction verifies the goal belongs to this campaign before writing the manually-registered value", () => {
    const fn = source.match(/export async function updateCampaignMetricValueAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/goal\.campaignId !== campaignId/);
  });

  it("no external social API is called anywhere in this phase's metrics code — results are always manually registered", () => {
    expect(source).not.toMatch(/fetch\(|axios|graph\.facebook|api\.twitter/i);
  });

  it("the performance chart reuses the existing Progress component — no new charting library was installed", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/recharts|chart\.js|victory|nivo|visx/i);
    const tab = read("src/components/campaign-studio/tabs/performance-tab.tsx");
    expect(tab).toMatch(/import \{ Progress \} from "@\/components\/ui\/progress"/);
  });
});

// ---------------------------------------------------------------------------
// 19. Templates & duplication
// ---------------------------------------------------------------------------
describe("Templates and duplication: never copy results/comments/published state, dates always recalculated (structural)", () => {
  const source = read("src/server/actions/campaign-studio.ts");

  it("saveCampaignAsTemplateAction snapshots pillars/strategy/channels/frequency/checklist into structure Json — a flexible blueprint, not individually queried fields", () => {
    const fn = source.match(/export async function saveCampaignAsTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/pillars: pillars\.map/);
    expect(fn).toMatch(/checklist: \[/);
    expect(fn).toMatch(/structure: structure as unknown as Prisma\.InputJsonValue/);
  });

  it("createCampaignFromTemplateAction always starts the new campaign as DRAFT, never inheriting the template's own lifecycle state", () => {
    const fn = source.match(/export async function createCampaignFromTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "DRAFT"/);
  });

  it("duplicateCampaignStudioCampaignAction recalculates dates via shiftDate rather than copying them literally", () => {
    const fn = source.match(/export async function duplicateCampaignStudioCampaignAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/shiftDate\(original\.endDate, oldStart, newStart\)/);
    expect(fn).toMatch(/shiftDate\(piece\.scheduledDate, oldStart, newStart\)/);
  });

  it("duplicateCampaignStudioCampaignAction never copies results/comments/assignee, and resets every piece to IDEA status", () => {
    const fn = source.match(/export async function duplicateCampaignStudioCampaignAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "IDEA" as const/);
    expect(fn).not.toMatch(/assigneeId: piece\.assigneeId/);
    expect(fn).not.toMatch(/comments:/);
  });

  it("duplication carries pillars over first and remaps piece.pillarId through the old->new id map — never a dangling reference to the source campaign's pillar", () => {
    const fn = source.match(/export async function duplicateCampaignStudioCampaignAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/pillarIdMap\.set\(pillar\.id, created\.id\)/);
    expect(fn).toMatch(/pillarIdMap\.get\(piece\.pillarId\)/);
  });
});

// ---------------------------------------------------------------------------
// 20. Permissions & project isolation — every action, no exceptions
// ---------------------------------------------------------------------------
describe("Permissions and project isolation: every campaign-studio server action validates access and ownership (structural)", () => {
  const files = [
    "src/server/actions/campaign-studio.ts",
    "src/server/actions/campaign-pillars.ts",
    "src/server/actions/campaign-pieces.ts",
    "src/server/actions/campaign-metrics.ts",
    "src/server/actions/campaign-team.ts",
  ];

  it("every exported action calls requireProjectAccess — never trusts projectId alone", () => {
    for (const file of files) {
      const source = read(file);
      const exportedFns = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
      expect(exportedFns.length).toBeGreaterThan(0);
      for (const fnName of exportedFns) {
        const fnMatch = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`));
        expect(fnMatch?.[0], `${file}: ${fnName} should call requireProjectAccess`).toMatch(/requireProjectAccess\(/);
      }
    }
  });

  it("every campaign-scoped action re-verifies campaign.projectId === projectId — a campaignId from another project is always rejected, never trusted from the client", () => {
    const source = read("src/server/actions/campaign-studio.ts");
    expect(source).toMatch(/async function getOwnedCampaign\(campaignId: string, projectId: string\)/);
    expect(source).toMatch(/if \(!campaign \|\| campaign\.projectId !== projectId\) return null;/);
  });

  it("createContentFromPieceAction never trusts a client-supplied contentId — it always creates its own ContentItem row and returns the real id", () => {
    const source = read("src/server/actions/campaign-pieces.ts");
    const fn = source.match(/export async function createContentFromPieceAction[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/input\.contentItemId/);
  });
});

// ---------------------------------------------------------------------------
// 21. Safe deletion
// ---------------------------------------------------------------------------
describe("Safe deletion: campaign/pillar/piece/metric deletes always verify ownership first (structural)", () => {
  it("deleteCampaignDraftAction verifies ownership before deleting the campaign", () => {
    const source = read("src/server/actions/campaign-studio.ts");
    const fn = source.match(/export async function deleteCampaignDraftAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedCampaign\(campaignId, projectId\)/);
    expect(fn).toMatch(/prisma\.campaign\.delete/);
  });

  it("deleteCampaignPillarAction and deleteCampaignPieceAction both verify ownership before deleting", () => {
    const pillars = read("src/server/actions/campaign-pillars.ts");
    const pieces = read("src/server/actions/campaign-pieces.ts");
    expect(pillars.match(/export async function deleteCampaignPillarAction[\s\S]*?\n\}/)![0]).toMatch(/getOwnedPillar\(pillarId, campaignId\)/);
    expect(pieces.match(/export async function deleteCampaignPieceAction[\s\S]*?\n\}/)![0]).toMatch(/getOwnedPiece\(pieceId, campaignId\)/);
  });

  it("Campaign->CampaignPillar/CampaignContentPiece/CampaignStrategy/CampaignMetricGoal are all cascade-deleted at the DB level — deleting a campaign never leaves orphans", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260725210000_add_campaign_studio/migration.sql");
    const pillarModel = schema.match(/model CampaignPillar \{[\s\S]*?\n\}/)![0];
    expect(pillarModel).toMatch(/campaign\s+Campaign\s+@relation\(fields: \[campaignId\], references: \[id\], onDelete: Cascade\)/);
    expect(migration).toMatch(/"CampaignPillar_campaignId_fkey" FOREIGN KEY \("campaignId"\) REFERENCES "Campaign"\("id"\) ON DELETE CASCADE/);
    expect(migration).toMatch(/"CampaignContentPiece_campaignId_fkey" FOREIGN KEY \("campaignId"\) REFERENCES "Campaign"\("id"\) ON DELETE CASCADE/);
  });

  it("deleting a ContentItem or BrandProfile never cascade-deletes the campaign — the FK uses SetNull, not Cascade", () => {
    const schema = read("prisma/schema.prisma");
    const campaignModel = schema.match(/model Campaign \{[\s\S]*?\n\}/)![0];
    const pieceModel = schema.match(/model CampaignContentPiece \{[\s\S]*?\n\}/)![0];
    expect(campaignModel).toMatch(/brandProfile\s+BrandProfile\?\s+@relation\(fields: \[brandProfileId\], references: \[id\], onDelete: SetNull\)/);
    expect(pieceModel).toMatch(/contentItem\s+ContentItem\?\s+@relation\(fields: \[contentItemId\], references: \[id\], onDelete: SetNull\)/);
  });
});

// ---------------------------------------------------------------------------
// 22. Schema — additive only, one migration, correct constraints
// ---------------------------------------------------------------------------
describe("Schema: Campaign Studio is additive-only, in a single new migration (structural)", () => {
  it("exactly one new migration folder exists for this phase", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    expect(migrations).toContain("20260725210000_add_campaign_studio");
  });

  it("the migration is additive only — no DROP TABLE, no DROP COLUMN", () => {
    const migration = read("prisma/migrations/20260725210000_add_campaign_studio/migration.sql");
    expect(migration).not.toMatch(/DROP TABLE/);
    expect(migration).not.toMatch(/DROP COLUMN/);
  });

  it("every prior migration is still present — nothing was removed, renamed, or edited", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    for (const prior of ["20260723193054_initial_schema", "20260725200000_add_editor_command_center"]) {
      expect(migrations).toContain(prior);
    }
  });

  it("CampaignMetricGoal has a unique constraint on (campaignId, metricType) — one goal per metric per campaign", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model CampaignMetricGoal \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[campaignId, metricType\]\)/);
  });

  it("CampaignContentPiece.contentItemId is unique — a ContentItem can only ever be linked from one planned piece", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model CampaignContentPiece \{[\s\S]*?\n\n  campaign/)![0];
    expect(model).toMatch(/contentItemId String\?\s+@unique/);
  });

  it("CampaignPillar and CampaignContentPiece both have an indexed `order` column for Kanban/reorder persistence", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/@@index\(\[campaignId, order\]\)/);
  });

  it("pillars, pieces, comments, and metrics are real relational models — never a single Json blob for searchable/relatable data", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model CampaignPillar \{/);
    expect(schema).toMatch(/model CampaignContentPiece \{/);
    expect(schema).toMatch(/model CampaignPieceComment \{/);
    expect(schema).toMatch(/model CampaignMetricGoal \{/);
  });

  it("Json is used only for the two explicitly-flexible cases: strategy version snapshots and template blueprints", () => {
    const schema = read("prisma/schema.prisma");
    expect((schema.match(/\sJson(\?)?\s/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const strategyVersion = schema.match(/model CampaignStrategyVersion \{[\s\S]*?\n\}/)![0];
    const template = schema.match(/model CampaignTemplate \{[\s\S]*?\n\}/)![0];
    expect(strategyVersion).toMatch(/snapshot\s+Json/);
    expect(template).toMatch(/structure\s+Json/);
  });
});

// ---------------------------------------------------------------------------
// 23. Route, navigation, and no-regression on frozen systems
// ---------------------------------------------------------------------------
describe("Route/navigation and regression: authenticated-only, no guest surface, existing calendar model reused where it applies (structural)", () => {
  it("the campaign-studio route lives under the authenticated per-project dashboard, not guest", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/campaign-studio/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/campaign-studio/[campaignId]/page.tsx"))).toBe(true);
  });

  it("guestNavGroups was never touched by this phase — Campaign Studio is authenticated-only", () => {
    const source = read("src/lib/navigation.ts");
    const guestBlock = source.match(/export const guestNavGroups[\s\S]*?\n\];/)![0];
    expect(guestBlock).not.toMatch(/Campaign Studio|campaign-studio/);
  });

  it("projectNavGroups gained exactly one new item: Campaign Studio, in the Redes sociales group", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/\{ label: "Campaign Studio", segment: "campaign-studio", icon: Rocket \}/);
  });

  it("scheduling reuses the existing SocialPost model (via scheduleContentForPublicationAction from Fase 27) — the campaign calendar tab visualizes CampaignContentPiece.scheduledDate, a genuinely new pre-publication planning concept, not a duplicate of the SocialPost-backed calendar", () => {
    const calendarPage = read("src/app/(dashboard)/dashboard/[projectId]/calendar/page.tsx");
    expect(calendarPage).toMatch(/prisma\.socialPost\.findMany/); // untouched
  });

  it("auth, email verification, Resend, and middleware were never modified by this phase", () => {
    const combined =
      read("src/lib/auth/config.ts") + read("src/lib/auth/edge-config.ts") + read("src/proxy.ts") + read("src/lib/email/send-email.ts");
    expect(combined).not.toMatch(/campaign-studio|CampaignPillar|CampaignContentPiece/i);
  });
});

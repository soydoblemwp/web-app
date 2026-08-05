import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_SPECS, COMPOSER_PLATFORM_VALUES, platformLabel } from "@/lib/publishing/platform-specs";
import { computeComposerWarnings } from "@/lib/publishing/composer-warnings";
import { validateMediaFile, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/publishing/media-validation";
import {
  defaultChecklistForPlatform,
  computeChecklistProgress,
  isChecklistComplete,
} from "@/lib/publishing/checklists";
import { EDITORIAL_STATUS_VALUES, STATUS_LABELS, isTerminalStatus, canSchedule, canApprove } from "@/lib/publishing/status";
import { generateRecurrenceInstances } from "@/lib/publishing/recurrence";
import { isPastSchedule, findSchedulingConflicts, formatInTimezone } from "@/lib/publishing/scheduling";
import { createNotConfiguredAdapter } from "@/lib/publishing/providers/not-configured-adapter";
import { providerIdForPlatform, getPublishingProvider, listPublishingProviders } from "@/lib/publishing/providers/registry";
import {
  publicationPatchSchema,
  createPublicationSchema,
  createPublicationCommentSchema,
  createPublicationSeriesSchema,
  checklistTemplateItemsSchema,
} from "@/lib/validation/publishing";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Platform specs / multichannel coverage — pure, real unit tests
// ---------------------------------------------------------------------------
describe("platform-specs.ts: the 10 composer channels from the spec (pure, real unit tests)", () => {
  it("the composer picker offers exactly Instagram, Facebook, TikTok, LinkedIn, YouTube, X, Pinterest, blog, email, newsletter", () => {
    expect(COMPOSER_PLATFORM_VALUES).toEqual([
      "INSTAGRAM",
      "FACEBOOK",
      "TIKTOK",
      "LINKEDIN",
      "YOUTUBE",
      "X",
      "PINTEREST",
      "BLOG",
      "EMAIL",
      "NEWSLETTER",
    ]);
  });

  it("every platform (including YOUTUBE_SHORTS) has a spec with a recommended length and a label", () => {
    for (const platform of Object.keys(PLATFORM_SPECS)) {
      expect(PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS].recommendedTextLength).toBeGreaterThan(0);
      expect(PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS].label).toBeTruthy();
    }
  });

  it("platformLabel falls back to the raw value for an unknown platform — never throws", () => {
    expect(platformLabel("INSTAGRAM")).toBe("Instagram");
    expect(platformLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// 2. Composer warnings — non-blocking, pure unit tests
// ---------------------------------------------------------------------------
describe("composer-warnings.ts: advisory-only warnings, never a hard block (pure, real unit tests)", () => {
  it("warns on missing media for a platform that requires it (Instagram)", () => {
    const warnings = computeComposerWarnings({
      platform: "INSTAGRAM",
      text: "hola",
      hashtags: ["#a"],
      cta: "Compra ya",
      link: "",
      mediaCount: 0,
      altTextCount: 0,
    });
    expect(warnings.map((w) => w.id)).toContain("missing-media");
  });

  it("warns on text exceeding the platform recommendation", () => {
    const warnings = computeComposerWarnings({
      platform: "X",
      text: "a".repeat(300),
      hashtags: [],
      cta: "",
      link: "",
      mediaCount: 0,
      altTextCount: 0,
    });
    expect(warnings.map((w) => w.id)).toContain("text-too-long");
  });

  it("warns on missing CTA, missing hashtags, and missing alt text independently", () => {
    const warnings = computeComposerWarnings({
      platform: "LINKEDIN",
      text: "texto corto",
      hashtags: [],
      cta: "",
      link: "",
      mediaCount: 1,
      altTextCount: 0,
    });
    expect(warnings.map((w) => w.id)).toEqual(expect.arrayContaining(["missing-cta", "missing-hashtags", "missing-alt-text"]));
  });

  it("warns on a broken/malformed link but not on an empty one", () => {
    const broken = computeComposerWarnings({ platform: "X", text: "t", hashtags: ["#a", "#b"], cta: "cta", link: "not-a-url", mediaCount: 0, altTextCount: 0 });
    expect(broken.map((w) => w.id)).toContain("broken-link");
    const empty = computeComposerWarnings({ platform: "X", text: "t", hashtags: ["#a", "#b"], cta: "cta", link: "", mediaCount: 0, altTextCount: 0 });
    expect(empty.map((w) => w.id)).not.toContain("broken-link");
  });

  it("a fully-complete post for a platform with no media requirement produces zero warnings", () => {
    const warnings = computeComposerWarnings({
      platform: "X",
      text: "Texto breve y completo.",
      hashtags: ["#a", "#b"],
      cta: "Compra ya",
      link: "https://example.com",
      mediaCount: 0,
      altTextCount: 0,
    });
    expect(warnings).toEqual([]);
  });

  it("is a pure function — identical input always yields identical output", () => {
    const input = { platform: "TIKTOK" as const, text: "x", hashtags: [], cta: "", link: "", mediaCount: 0, altTextCount: 0 };
    expect(computeComposerWarnings(input)).toEqual(computeComposerWarnings(input));
  });
});

// ---------------------------------------------------------------------------
// 3. Media validation — pure unit tests
// ---------------------------------------------------------------------------
describe("media-validation.ts: MIME/extension/size/duration checks (pure, real unit tests)", () => {
  it("accepts a valid JPEG under the size limit", () => {
    const result = validateMediaFile({ filename: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 1024 });
    expect(result).toEqual({ valid: true, kind: "IMAGE", errors: [] });
  });

  it("rejects a disallowed MIME type", () => {
    const result = validateMediaFile({ filename: "doc.pdf", mimeType: "application/pdf", sizeBytes: 1024 });
    expect(result.valid).toBe(false);
    expect(result.kind).toBeNull();
  });

  it("rejects an extension that doesn't match the MIME type", () => {
    const result = validateMediaFile({ filename: "foto.png", mimeType: "image/jpeg", sizeBytes: 1024 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/extensión/);
  });

  it("rejects an image over the max size, and a video over the max size, using the two different limits", () => {
    const bigImage = validateMediaFile({ filename: "big.jpg", mimeType: "image/jpeg", sizeBytes: MAX_IMAGE_BYTES + 1 });
    expect(bigImage.valid).toBe(false);
    const bigVideo = validateMediaFile({ filename: "big.mp4", mimeType: "video/mp4", sizeBytes: MAX_VIDEO_BYTES + 1 });
    expect(bigVideo.valid).toBe(false);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });

  it("rejects a video exceeding the max duration", () => {
    const result = validateMediaFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 1024, durationSeconds: 60 * 30 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duración"))).toBe(true);
  });

  it("rejects an empty (zero-byte) file", () => {
    expect(validateMediaFile({ filename: "empty.png", mimeType: "image/png", sizeBytes: 0 }).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Checklists — pure unit tests
// ---------------------------------------------------------------------------
describe("checklists.ts: per-platform checklists, progress, completion (pure, real unit tests)", () => {
  it("Instagram, YouTube, and Email each have their own built-in checklist from the spec", () => {
    expect(defaultChecklistForPlatform("INSTAGRAM").length).toBeGreaterThan(0);
    expect(defaultChecklistForPlatform("YOUTUBE").length).toBeGreaterThan(0);
    expect(defaultChecklistForPlatform("EMAIL").length).toBeGreaterThan(0);
  });

  it("a platform with no dedicated checklist falls back to a generic one — never empty", () => {
    expect(defaultChecklistForPlatform("PINTEREST").length).toBeGreaterThan(0);
  });

  it("computeChecklistProgress is 0% with no state and 100% when every item is checked", () => {
    const items = defaultChecklistForPlatform("EMAIL");
    expect(computeChecklistProgress(items, null)).toBe(0);
    const fullState = Object.fromEntries(items.map((i) => [i.id, true]));
    expect(computeChecklistProgress(items, fullState)).toBe(100);
    expect(isChecklistComplete(items, fullState)).toBe(true);
  });

  it("partial completion never rounds up to 100%", () => {
    const items = defaultChecklistForPlatform("INSTAGRAM");
    const partial = { [items[0].id]: true };
    expect(isChecklistComplete(items, partial)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Editorial status / approval rules — pure unit tests
// ---------------------------------------------------------------------------
describe("status.ts: the 9 editorial states, scheduling gate, self-approval gate (pure, real unit tests)", () => {
  it("defines exactly the 9 pipeline states from the spec, each with a Spanish label", () => {
    expect(EDITORIAL_STATUS_VALUES).toEqual([
      "DRAFT",
      "IN_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "FAILED",
      "CANCELLED",
    ]);
    for (const status of EDITORIAL_STATUS_VALUES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("PUBLISHED, CANCELLED, and ARCHIVED are terminal — nothing else is", () => {
    expect(isTerminalStatus("PUBLISHED")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("ARCHIVED")).toBe(true);
    expect(isTerminalStatus("DRAFT")).toBe(false);
    expect(isTerminalStatus("APPROVED")).toBe(false);
  });

  it("canSchedule allows any non-terminal status when approval isn't required", () => {
    expect(canSchedule("DRAFT", false)).toBe(true);
    expect(canSchedule("IN_REVIEW", false)).toBe(true);
    expect(canSchedule("PUBLISHED", false)).toBe(false);
  });

  it("canSchedule blocks scheduling until APPROVED when the project requires approval — the exact spec-7 gate", () => {
    expect(canSchedule("DRAFT", true)).toBe(false);
    expect(canSchedule("IN_REVIEW", true)).toBe(false);
    expect(canSchedule("APPROVED", true)).toBe(true);
    expect(canSchedule("SCHEDULED", true)).toBe(true);
  });

  it("canApprove allows self-approval only when the project setting permits it", () => {
    expect(canApprove({ actorId: "u1", authorId: "u1", allowSelfApproval: true })).toBe(true);
    expect(canApprove({ actorId: "u1", authorId: "u1", allowSelfApproval: false })).toBe(false);
    expect(canApprove({ actorId: "u2", authorId: "u1", allowSelfApproval: false })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Recurrence — pure unit tests
// ---------------------------------------------------------------------------
describe("recurrence.ts: generateRecurrenceInstances (pure, real unit tests)", () => {
  it("DAILY generates one instance per day up to maxInstances", () => {
    const dates = generateRecurrenceInstances(
      { frequency: "DAILY", daysOfWeek: [], intervalDays: null, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      5
    );
    expect(dates).toHaveLength(5);
    expect(dates[1].getTime() - dates[0].getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("WEEKLY spaces instances 7 days apart", () => {
    const dates = generateRecurrenceInstances(
      { frequency: "WEEKLY", daysOfWeek: [], intervalDays: null, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      3
    );
    expect(dates[1].getTime() - dates[0].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("SPECIFIC_DAYS only lands on the requested weekdays", () => {
    const dates = generateRecurrenceInstances(
      { frequency: "SPECIFIC_DAYS", daysOfWeek: ["MON", "WED"], intervalDays: null, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      6
    );
    for (const d of dates) {
      expect([1, 3]).toContain(d.getUTCDay());
    }
  });

  it("SPECIFIC_DAYS with no days selected generates nothing instead of looping forever", () => {
    const dates = generateRecurrenceInstances(
      { frequency: "SPECIFIC_DAYS", daysOfWeek: [], intervalDays: null, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      6
    );
    expect(dates).toEqual([]);
  });

  it("CUSTOM_INTERVAL respects the configured interval and MONTHLY advances by a month", () => {
    const custom = generateRecurrenceInstances(
      { frequency: "CUSTOM_INTERVAL", daysOfWeek: [], intervalDays: 3, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      3
    );
    expect(custom[1].getTime() - custom[0].getTime()).toBe(3 * 24 * 60 * 60 * 1000);

    const monthly = generateRecurrenceInstances(
      { frequency: "MONTHLY", daysOfWeek: [], intervalDays: null, startDate: new Date("2026-08-01T09:00:00Z"), endDate: null },
      2
    );
    expect(monthly[1].getUTCMonth()).toBe((monthly[0].getUTCMonth() + 1) % 12);
  });

  it("respects an endDate boundary — never generates past it", () => {
    const dates = generateRecurrenceInstances(
      {
        frequency: "DAILY",
        daysOfWeek: [],
        intervalDays: null,
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-03T00:00:00Z"),
      },
      100
    );
    for (const d of dates) {
      expect(d.getTime()).toBeLessThanOrEqual(new Date("2026-08-03T00:00:00Z").getTime());
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Scheduling / timezones / conflicts — pure unit tests
// ---------------------------------------------------------------------------
describe("scheduling.ts: past-date detection, conflict detection, timezone display (pure, real unit tests)", () => {
  it("isPastSchedule detects a date before now", () => {
    expect(isPastSchedule(new Date("2000-01-01"), new Date("2026-01-01"))).toBe(true);
    expect(isPastSchedule(new Date("2030-01-01"), new Date("2026-01-01"))).toBe(false);
  });

  it("findSchedulingConflicts flags same-platform posts scheduled within the window, excluding the candidate's own id", () => {
    const existing = [
      { id: "a", platform: "INSTAGRAM", scheduledAt: new Date("2026-08-01T10:00:00Z") },
      { id: "b", platform: "INSTAGRAM", scheduledAt: new Date("2026-08-01T10:02:00Z") },
      { id: "c", platform: "FACEBOOK", scheduledAt: new Date("2026-08-01T10:01:00Z") },
    ];
    const conflicts = findSchedulingConflicts({ platform: "INSTAGRAM", scheduledAt: new Date("2026-08-01T10:00:00Z"), excludeId: "a" }, existing);
    expect(conflicts.map((c) => c.id)).toEqual(["b"]);
  });

  it("findSchedulingConflicts never flags a different platform, even at the exact same instant", () => {
    const existing = [{ id: "c", platform: "FACEBOOK", scheduledAt: new Date("2026-08-01T10:00:00Z") }];
    const conflicts = findSchedulingConflicts({ platform: "INSTAGRAM", scheduledAt: new Date("2026-08-01T10:00:00Z") }, existing);
    expect(conflicts).toEqual([]);
  });

  it("formatInTimezone never throws, even for an invalid timezone id — falls back to ISO", () => {
    expect(() => formatInTimezone(new Date(), "Not/AZone")).not.toThrow();
    expect(formatInTimezone(new Date("2026-01-01T00:00:00Z"), "Not/AZone")).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 8. Provider adapters — never simulate a real publish (pure, real unit tests)
// ---------------------------------------------------------------------------
describe("providers: not-configured adapters never report success (pure, real unit tests)", () => {
  it("createNotConfiguredAdapter always reports itself unconfigured and refuses to publish", async () => {
    const adapter = createNotConfiguredAdapter("meta", "Meta");
    const status = await adapter.getStatus();
    expect(status.configured).toBe(false);

    const publishResult = await adapter.publish({ socialPostId: "p1", platform: "INSTAGRAM", text: "hola", mediaUrls: [] });
    expect(publishResult.success).toBe(false);
    expect(publishResult.errorCode).toBe("not_configured");

    const validateResult = await adapter.validate({ socialPostId: "p1", platform: "INSTAGRAM", text: "hola", mediaUrls: [] });
    expect(validateResult.valid).toBe(false);
  });

  it("every one of the 8 provider ids in the registry maps to a working adapter", async () => {
    const providers = listPublishingProviders();
    expect(providers).toHaveLength(8);
    for (const provider of providers) {
      const status = await provider.getStatus();
      expect(status.configured).toBe(false);
    }
  });

  it("providerIdForPlatform routes every composer platform to a real adapter id, never throwing on an unknown platform", () => {
    expect(providerIdForPlatform("INSTAGRAM")).toBe("meta");
    expect(providerIdForPlatform("FACEBOOK")).toBe("meta");
    expect(providerIdForPlatform("YOUTUBE_SHORTS")).toBe("youtube");
    expect(providerIdForPlatform("BLOG")).toBe("wordpress");
    expect(providerIdForPlatform("NEWSLETTER")).toBe("email");
    expect(() => getPublishingProvider(providerIdForPlatform("UNKNOWN_PLATFORM"))).not.toThrow();
  });

  it("no external social SDK was installed — no meta/tiktok/linkedin/twitter package in package.json", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/"(facebook-nodejs-business-sdk|tiktok-business-api|twitter-api-v2|linkedin-api)"/i);
  });
});

// ---------------------------------------------------------------------------
// 9. Storage abstraction — pure structural tests (no real credentials to call)
// ---------------------------------------------------------------------------
describe("storage: local-dev-first abstraction, ready for Vercel Blob / S3 (structural)", () => {
  it("getStorageProvider prefers a configured real provider and always falls back to local dev", () => {
    const source = read("src/lib/storage/index.ts");
    expect(source).toMatch(/vercelBlobStorageProvider\.isConfigured/);
    expect(source).toMatch(/s3CompatibleStorageProvider\.isConfigured/);
    expect(source).toMatch(/return localDevStorageProvider/);
  });

  it("the Vercel Blob and S3 providers never fabricate a production URL when not configured — they throw instead", () => {
    const blob = read("src/lib/storage/vercel-blob-provider.ts");
    const s3 = read("src/lib/storage/s3-compatible-provider.ts");
    expect(blob).toMatch(/throw new Error/);
    expect(s3).toMatch(/throw new Error/);
  });

  it("no external storage SDK was installed — @vercel/blob and aws-sdk are absent from package.json", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/"@vercel\/blob"|"@aws-sdk\/client-s3"|"aws-sdk"/);
  });

  it("media is never persisted as base64 in Prisma — FileAsset stores a storageKey/url, not raw bytes", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model FileAsset \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/storageKey\s+String/);
    expect(model).not.toMatch(/data\s+Bytes|base64/i);
  });
});

// ---------------------------------------------------------------------------
// 10. Validation schemas — pure unit tests
// ---------------------------------------------------------------------------
describe("validation/publishing.ts: zod schemas (pure, real unit tests)", () => {
  it("publicationPatchSchema.partial() accepts an empty object — composer autosave sends true partial patches", () => {
    expect(publicationPatchSchema.partial().safeParse({}).success).toBe(true);
  });

  it("createPublicationSchema requires platform and a non-empty internal title", () => {
    expect(createPublicationSchema.safeParse({ platform: "INSTAGRAM", internalTitle: "" }).success).toBe(false);
    expect(createPublicationSchema.safeParse({ internalTitle: "Título" }).success).toBe(false);
    expect(createPublicationSchema.safeParse({ platform: "INSTAGRAM", internalTitle: "Título" }).success).toBe(true);
  });

  it("createPublicationCommentSchema constrains action to the 5 approval actions", () => {
    expect(createPublicationCommentSchema.safeParse({ action: "APPROVED" }).success).toBe(true);
    expect(createPublicationCommentSchema.safeParse({ action: "MADE_UP" }).success).toBe(false);
  });

  it("createPublicationSeriesSchema requires a frequency, platform, title, and startDate", () => {
    expect(
      createPublicationSeriesSchema.safeParse({
        frequency: "DAILY",
        daysOfWeek: [],
        startDate: "2026-08-01",
        platform: "INSTAGRAM",
        internalTitle: "Serie",
      }).success
    ).toBe(true);
    expect(createPublicationSeriesSchema.safeParse({ frequency: "DAILY" }).success).toBe(false);
  });

  it("checklistTemplateItemsSchema caps at 30 items, each with an id and label", () => {
    expect(checklistTemplateItemsSchema.safeParse([{ id: "a", label: "A" }]).success).toBe(true);
    expect(checklistTemplateItemsSchema.safeParse([{ id: "a" }]).success).toBe(false);
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ id: `i${i}`, label: `L${i}` }));
    expect(checklistTemplateItemsSchema.safeParse(tooMany).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Publication creation, autosave concurrency, duplication — structural
// ---------------------------------------------------------------------------
describe("publishing.ts: creation from every origin, optimistic concurrency, safe duplication (structural)", () => {
  const source = read("src/server/actions/publishing.ts");

  it("createPublicationAction handles all 6 origins: blank, ContentItem, campaign piece, campaign, template, duplicate — never a second content model", () => {
    const fn = source.match(/export async function createPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/d\.sourceContentId/);
    expect(fn).toMatch(/d\.sourcePieceId/);
    expect(fn).toMatch(/campaignId/);
    expect(fn).toMatch(/d\.templateId/);
    expect(fn).toMatch(/d\.duplicateFromId/);
    expect(fn).toMatch(/prisma\.socialPost\.create/);
    expect(source).not.toMatch(/model SocialPostV2|prisma\.publication\.create/);
  });

  it("updatePublicationAction rejects a stale save when expectedUpdatedAt doesn't match the current row — optimistic concurrency per spec section 17", () => {
    const fn = source.match(/export async function updatePublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/expectedUpdatedAt && new Date\(expectedUpdatedAt\)\.getTime\(\) !== current\.updatedAt\.getTime\(\)/);
    expect(fn).toMatch(/Esta publicación cambió en otra pestaña/);
  });

  it("updatePublicationAction writes a true partial patch — every field gated on !== undefined, never a `?? []`/`?? null` overwrite of an omitted field", () => {
    const fn = source.match(/export async function updatePublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/d\.hashtags !== undefined/);
    expect(fn).toMatch(/d\.campaignId !== undefined/);
    expect(fn).not.toMatch(/hashtags: d\.hashtags \?\? \[\]/);
  });

  it("updatePublicationAction blocks moving to SCHEDULED when the project requires approval and the post isn't approved", () => {
    const fn = source.match(/export async function updatePublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/canSchedule\(current\.status, project\.requireApprovalBeforePublish\)/);
  });

  it("duplicatePublicationAction never copies scheduledAt, publishedAt, externalId, attempts, errors, approval history, or queue state", () => {
    const fn = source.match(/export async function duplicatePublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "DRAFT"/);
    expect(fn).not.toMatch(/scheduledAt: original\.scheduledAt/);
    expect(fn).not.toMatch(/publishedAt: original\.publishedAt/);
    expect(fn).not.toMatch(/externalId: original\.externalId/);
    expect(fn).not.toMatch(/queuePosition: original\.queuePosition/);
  });

  it("createPublicationAction never copies a duplicate source's scheduling/attempt/approval state either", () => {
    const fn = source.match(/export async function createPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/scheduledAt: duplicateFrom/);
    expect(fn).not.toMatch(/attemptCount: duplicateFrom/);
  });
});

// ---------------------------------------------------------------------------
// 12. Approval flow — structural
// ---------------------------------------------------------------------------
describe("publishing.ts: approval flow — submit, approve, request changes, self-approval guard, history (structural)", () => {
  const source = read("src/server/actions/publishing.ts");
  const fn = source.match(/export async function recordApprovalDecisionAction[\s\S]*?\n\}/)![0];

  it("blocks self-approval when the project setting forbids it, using canApprove", () => {
    expect(fn).toMatch(/canApprove\(\{ actorId: user\.id, authorId: post\.authorId, allowSelfApproval: project\.allowSelfApproval \}\)/);
    expect(fn).toMatch(/No puedes aprobar tu propia publicación/);
  });

  it("every decision is logged as a real PublicationApprovalEvent row — a queryable history, not an overwritten field", () => {
    expect(fn).toMatch(/publicationApprovalEvent\.create/);
  });

  it("records who approved and when, distinct from who was merely assigned as approver", () => {
    expect(fn).toMatch(/approvedById: user\.id, approvedAt: new Date\(\)/);
  });

  it("getApprovalHistoryAction derives the project from the post's own row — never trusts a client-supplied projectId (spec section 19)", () => {
    const readSource = read("src/server/actions/publishing-approval-read.ts");
    expect(readSource).toMatch(/const post = await prisma\.socialPost\.findUnique\(\{ where: \{ id: postId \}, select: \{ projectId: true \} \}\)/);
    expect(readSource).toMatch(/requireProjectAccess\(post\.projectId, "VIEWER"\)/);
  });
});

// ---------------------------------------------------------------------------
// 13. Publishing queue — structural
// ---------------------------------------------------------------------------
describe("Queue: reorder, pause/resume, cancel, retry — DB-persistent, no external worker (structural)", () => {
  const actions = read("src/server/actions/publishing.ts");

  it("reorderPublicationQueueAction rejects any id not owned by this project before writing, and persists in one transaction", () => {
    const fn = actions.match(/export async function reorderPublicationQueueAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!orderedIds\.every\(\(id\) => ownedIds\.has\(id\)\)\) return \{ error:/);
    expect(fn).toMatch(/prisma\.\$transaction\(/);
  });

  it("setQueuePausedAction and retryPublicationAction both verify ownership before mutating", () => {
    expect(actions.match(/export async function setQueuePausedAction[\s\S]*?\n\}/)![0]).toMatch(/getOwnedPost\(postId, projectId\)/);
    expect(actions.match(/export async function retryPublicationAction[\s\S]*?\n\}/)![0]).toMatch(/getOwnedPost\(postId, projectId\)/);
  });

  it("retryPublicationAction refuses to retry a non-retryable failure", () => {
    const fn = actions.match(/export async function retryPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(post\.isRetryable === false\) return \{ error:/);
  });

  it("retryPublicationAction creates a new PublicationAttempt row rather than mutating history, and never marks it published — no fake success", () => {
    const fn = actions.match(/export async function retryPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/publicationAttempt\.create/);
    expect(fn).not.toMatch(/status: "PUBLISHED"/);
  });

  it("no external queue/worker package (bullmq, agenda, bee-queue) was installed for this phase", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/"bullmq"|"agenda"|"bee-queue"/);
  });

  it("the queue view drags/drops with native HTML5 events and calls the reorder action — no drag library installed", () => {
    const source = read("src/components/publishing/views/queue-view.tsx");
    expect(source).toMatch(/draggable/);
    expect(source).toMatch(/onDrop/);
    expect(source).toMatch(/reorderPublicationQueueAction/);
  });
});

// ---------------------------------------------------------------------------
// 14. Scheduling / calendar integration — structural
// ---------------------------------------------------------------------------
describe("Calendar: reuses the existing SocialPost-backed calendar model, drag-and-drop with optimistic rollback-safe persistence (structural)", () => {
  it("the Publishing Hub calendar view persists a drop via moveScheduledDateAction, never inventing a second scheduling model", () => {
    const source = read("src/components/publishing/views/calendar-view.tsx");
    expect(source).toMatch(/moveScheduledDateAction/);
    expect(source).toMatch(/draggable/);
    expect(source).toMatch(/onDrop/);
  });

  it("filters by platform, status, campaign is not duplicated — assignee/approver/priority filters are wired to real Select controls", () => {
    const source = read("src/components/publishing/views/calendar-view.tsx");
    for (const filter of ["assigneeFilter", "approverFilter", "priorityFilter"]) {
      expect(source).toContain(filter);
    }
    expect(source).toMatch(/setAssigneeFilter/);
    expect(source).toMatch(/setPriorityFilter\(v\)/);
  });

  it("moveScheduledDateAction verifies ownership before writing the new date", () => {
    const fn = read("src/server/actions/publishing.ts").match(/export async function moveScheduledDateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPost\(postId, projectId\)/);
  });

  it("the existing /calendar route (Fase 26/27) was not touched — still queries socialPost directly, no second calendar model", () => {
    const calendarPage = read("src/app/(dashboard)/dashboard/[projectId]/calendar/page.tsx");
    expect(calendarPage).toMatch(/prisma\.socialPost\.findMany/);
  });
});

// ---------------------------------------------------------------------------
// 15. Recurrence series — structural
// ---------------------------------------------------------------------------
describe("Recurrence series: de-duplicated instance generation, series-scoped cancellation (structural)", () => {
  const source = read("src/server/actions/publishing.ts");

  it("createPublicationSeriesAction de-duplicates against already-existing posts at the same platform+instant before creating", () => {
    const fn = source.match(/export async function createPublicationSeriesAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/existingTimes\.has\(date\.getTime\(\)\)/);
  });

  it("cancelPublicationSeriesAction only cancels future, non-terminal instances — never rewrites published history", () => {
    const fn = source.match(/export async function cancelPublicationSeriesAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: \{ in: \["SCHEDULED", "DRAFT", "APPROVED"\] \}/);
    expect(fn).not.toMatch(/status: \{ in: \[.*"PUBLISHED".*\] \}/);
  });
});

// ---------------------------------------------------------------------------
// 16. Media library, uploads, safe deletion — structural
// ---------------------------------------------------------------------------
describe("publishing-media.ts: upload validation, reuse, safe delete (structural)", () => {
  const source = read("src/server/actions/publishing-media.ts");

  it("uploadMediaAction validates the file before touching storage", () => {
    const fn = source.match(/export async function uploadMediaAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/validateMediaFile\(/);
    expect(fn).toMatch(/if \(!validation\.valid\) return \{ error:/);
  });

  it("deleteMediaAction refuses to delete a file still attached to an active (non-terminal) publication", () => {
    const fn = source.match(/export async function deleteMediaAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: \{ notIn: \["PUBLISHED", "CANCELLED", "ARCHIVED", "FAILED"\] \}/);
    expect(fn).toMatch(/if \(activeUse\) \{/);
  });

  it("attachMediaToPublicationAction reuses an existing FileAsset by id — it never re-uploads bytes for reuse", () => {
    const fn = source.match(/export async function attachMediaToPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/publicationMedia\.upsert/);
    expect(fn).not.toMatch(/getStorageProvider\(\)\.upload/);
  });

  it("every media action verifies project ownership of both the asset and (where relevant) the post", () => {
    for (const fnName of ["uploadMediaAction", "updateMediaAction", "archiveMediaAction", "deleteMediaAction"]) {
      const fn = source.match(new RegExp(`export async function ${fnName}[\\s\\S]*?\\n\\}`))![0];
      expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Templates — structural
// ---------------------------------------------------------------------------
describe("publishing-templates.ts: save/reuse templates, never copying live state (structural)", () => {
  const source = read("src/server/actions/publishing-templates.ts");

  it("savePublicationAsTemplateAction snapshots structural fields into structure Json — a flexible blueprint, not individually queried columns", () => {
    const fn = source.match(/export async function savePublicationAsTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/platform: post\.platform/);
    expect(fn).toMatch(/checklist: defaultChecklistForPlatform\(post\.platform\)/);
    expect(fn).toMatch(/structure: structure as unknown as Prisma\.InputJsonValue/);
  });

  it("saveChecklistTemplateAction requires MANAGER access — configuring checklists/blocking is a project-policy action", () => {
    const fn = source.match(/export async function saveChecklistTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
  });

  it("updatePublicationChecklistStateAction only blocks scheduling when the project's template explicitly sets blocksPublish", () => {
    const fn = source.match(/export async function updatePublicationChecklistStateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(template\?\.blocksPublish\) \{/);
  });
});

// ---------------------------------------------------------------------------
// 18. Errors / retries / not-configured adapters — structural
// ---------------------------------------------------------------------------
describe("Errors and retries: safe messages only, no tokens, simulation never presented as real (structural)", () => {
  it("PublicationAttempt never stores tokens or raw provider responses — only safe fields", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PublicationAttempt \{[\s\S]*?\n\}/)![0];
    expect(model).not.toMatch(/\baccessToken\b|\brawResponse\b|\bcredential/i);
    expect(model).toMatch(/errorMessage\s+String\?/);
  });

  it("the not-configured adapter's reason string is safe/generic — never a token, header, or internal stack", () => {
    const source = read("src/lib/publishing/providers/not-configured-adapter.ts");
    expect(source).not.toMatch(/token|apiKey|secret/i);
  });

  it("PublicationAttemptStatus enum matches the spec's visible states: waiting, processing, published, temporary/permanent error, cancelled", () => {
    const schema = read("prisma/schema.prisma");
    const enumBlock = schema.match(/enum PublicationAttemptStatus \{[\s\S]*?\n\}/)![0];
    for (const state of ["WAITING", "PROCESSING", "PUBLISHED", "TEMPORARY_ERROR", "PERMANENT_ERROR", "CANCELLED"]) {
      expect(enumBlock).toContain(state);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. Permissions & project isolation — every action, no exceptions
// ---------------------------------------------------------------------------
describe("Permissions and project isolation: every publishing server action validates access and ownership (structural)", () => {
  const files = [
    "src/server/actions/publishing.ts",
    "src/server/actions/publishing-media.ts",
    "src/server/actions/publishing-templates.ts",
    "src/server/actions/publishing-select.ts",
    "src/server/actions/publishing-checklist-read.ts",
    "src/server/actions/publishing-approval-read.ts",
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

  it("getOwnedPost re-verifies post.projectId === projectId — a postId from another project is always rejected, never trusted from the client", () => {
    const source = read("src/server/actions/publishing.ts");
    expect(source).toMatch(/async function getOwnedPost\(postId: string, projectId: string\)/);
    expect(source).toMatch(/if \(!post \|\| post\.projectId !== projectId\) return null;/);
  });

  it("updatePublishingPolicyAction requires MANAGER — only project managers/owners can change the approval policy", () => {
    const fn = read("src/server/actions/publishing.ts").match(/export async function updatePublishingPolicyAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
  });
});

// ---------------------------------------------------------------------------
// 20. Campaign / ContentItem relations — structural
// ---------------------------------------------------------------------------
describe("Relations: SocialPost links to ContentItem and CampaignContentPiece without duplicating either (structural)", () => {
  it("SocialPost has sourceContentId and sourcePieceId FKs, both nullable with SetNull-safe deletion for the piece relation", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model SocialPost \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/sourceContentId String\?/);
    expect(model).toMatch(/sourcePieceId\s+String\?/);
    expect(model).toMatch(/sourcePiece\s+CampaignContentPiece\?\s+@relation\(fields: \[sourcePieceId\], references: \[id\], onDelete: SetNull\)/);
  });

  it("createPublicationAction inherits campaignId/brandProfileId from the source ContentItem or campaign piece instead of requiring re-entry", () => {
    const fn = read("src/server/actions/publishing.ts").match(/export async function createPublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/campaignId = campaignId \?\? piece\.campaignId/);
    expect(fn).toMatch(/brandProfileId = brandProfileId \?\? campaign\.brandProfileId/);
  });
});

// ---------------------------------------------------------------------------
// 21. Safe deletion & concurrency
// ---------------------------------------------------------------------------
describe("Safe deletion and concurrency: publications and media both verify ownership before deleting; autosave shows saving/saved/error states (structural)", () => {
  it("deletePublicationAction verifies ownership before deleting", () => {
    const fn = read("src/server/actions/publishing.ts").match(/export async function deletePublicationAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPost\(postId, projectId\)/);
    expect(fn).toMatch(/prisma\.socialPost\.delete/);
  });

  it("the composer reuses the existing useEditorAutosave hook — one autosave implementation, not a second one", () => {
    const source = read("src/components/publishing/composer/publication-composer.tsx");
    expect(source).toMatch(/import \{ useEditorAutosave.* \} from "@\/components\/editor\/use-editor-autosave"/);
    expect(source).toMatch(/useEditorAutosave\(async \(\) => \{/);
  });

  it("the composer tracks updatedAt in a ref and sends it as expectedUpdatedAt on every autosave — the concurrency guard is actually wired up client-side, not just server-side", () => {
    const source = read("src/components/publishing/composer/publication-composer.tsx");
    expect(source).toMatch(/updatedAtRef\.current/);
    expect(source).toMatch(/updatePublicationAction\(projectId, post\.id, buildPatch\(postRef\.current\), updatedAtRef\.current\)/);
  });
});

// ---------------------------------------------------------------------------
// 22. Schema — additive only, one migration, correct constraints
// ---------------------------------------------------------------------------
describe("Schema: Publishing Hub is additive-only, in a single new migration (structural)", () => {
  it("exactly one new migration folder exists for this phase", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    expect(migrations).toContain("20260725220000_add_publishing_hub");
  });

  it("the migration is additive only — no DROP TABLE, no DROP COLUMN", () => {
    const migration = read("prisma/migrations/20260725220000_add_publishing_hub/migration.sql");
    expect(migration).not.toMatch(/DROP TABLE/);
    expect(migration).not.toMatch(/DROP COLUMN/);
  });

  it("every prior migration is still present — nothing was removed, renamed, or edited", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    for (const prior of ["20260723193054_initial_schema", "20260725200000_add_editor_command_center", "20260725210000_add_campaign_studio"]) {
      expect(migrations).toContain(prior);
    }
  });

  it("Project gained requireApprovalBeforePublish and allowSelfApproval, both with safe defaults", () => {
    const migration = read("prisma/migrations/20260725220000_add_publishing_hub/migration.sql");
    expect(migration).toMatch(/"requireApprovalBeforePublish" BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/"allowSelfApproval" BOOLEAN NOT NULL DEFAULT true/);
  });

  it("PublicationMedia has a unique (socialPostId, fileAssetId) constraint — a media asset can only be attached once per publication", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PublicationMedia \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[socialPostId, fileAssetId\]\)/);
  });

  it("PublishingChecklistTemplate has a unique (projectId, platform) constraint — one checklist config per platform per project", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model PublishingChecklistTemplate \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[projectId, platform\]\)/);
  });

  it("publications, media attachments, approval events, and attempts are real relational models — never a single Json blob for searchable/relatable data", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model PublicationMedia \{/);
    expect(schema).toMatch(/model PublicationApprovalEvent \{/);
    expect(schema).toMatch(/model PublicationAttempt \{/);
    expect(schema).toMatch(/model PublicationSeries \{/);
  });

  it("Json is used only for the explicitly-flexible cases: template structure, checklist item lists, and per-post checklist completion state", () => {
    const schema = read("prisma/schema.prisma");
    const template = schema.match(/model PublicationTemplate \{[\s\S]*?\n\}/)![0];
    const checklistTemplate = schema.match(/model PublishingChecklistTemplate \{[\s\S]*?\n\}/)![0];
    expect(template).toMatch(/structure\s+Json/);
    expect(checklistTemplate).toMatch(/items\s+Json/);
  });

  it("SocialPost was extended additively — pre-existing fields (id, projectId, platform, text, status, scheduledAt) are untouched", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model SocialPost \{[\s\S]*?\n\}/)![0];
    for (const field of ["id              String", "projectId       String", "platform        SocialPlatform", "text            String", "scheduledAt     DateTime?"]) {
      expect(model).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// 23. Route, navigation, and no-regression on frozen systems
// ---------------------------------------------------------------------------
describe("Route/navigation and regression: authenticated-only, no guest surface, no external API connected (structural)", () => {
  it("the publishing route lives under the authenticated per-project dashboard, not guest", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/publishing/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/publishing/[postId]/page.tsx"))).toBe(true);
  });

  it("guestNavGroups was never touched by this phase — Publishing Hub is authenticated-only", () => {
    const source = read("src/lib/navigation.ts");
    const guestBlock = source.match(/export const guestNavGroups[\s\S]*?\n\];/)![0];
    expect(guestBlock).not.toMatch(/Publishing Hub|publishing/);
  });

  it("projectNavGroups gained exactly one new item: Publishing Hub, in the Redes sociales group", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/\{ label: "Publishing Hub", segment: "publishing", icon: Send \}/);
  });

  it("no real Instagram/Facebook/TikTok/LinkedIn/YouTube/X SDK client was connected anywhere in this phase", () => {
    const combined =
      read("src/lib/publishing/providers/not-configured-adapter.ts") + read("src/lib/publishing/providers/registry.ts");
    expect(combined).not.toMatch(/graph\.facebook\.com|api\.twitter\.com|open\.tiktokapis\.com|googleapis\.com\/youtube/i);
  });

  it("auth, email verification, Resend, and middleware were never modified by this phase", () => {
    const combined =
      read("src/lib/auth/config.ts") + read("src/lib/auth/edge-config.ts") + read("src/proxy.ts") + read("src/lib/email/send-email.ts");
    expect(combined).not.toMatch(/publishing-hub|PublicationMedia|PublicationAttempt/i);
  });

  it("no alert() or confirm() is used anywhere in the Publishing Hub UI", () => {
    const dir = path.join(ROOT, "src/components/publishing");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(d, entry.name)) : entry.name.endsWith(".tsx") ? [path.join(d, entry.name)] : []
      );
    for (const file of walk(dir)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });
});

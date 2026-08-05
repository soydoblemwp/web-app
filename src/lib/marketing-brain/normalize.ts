import { CAMPAIGN_CHANNELS } from "@/lib/campaign-studio/channels";
import type { MarketingBrainBriefing, NormalizedBriefing } from "@/lib/marketing-brain/types";

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_RANGE_DAYS = 30;
const MAX_PIECES_HARD_CAP = 200;
const MIN_RANGE_DAYS_WARNING = 3;

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isKnownTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The deterministic normalization layer from spec section 4 — runs BEFORE
 * any AI call. Every field the caller didn't explicitly supply gets a
 * sensible, documented default and is listed in `inferredFields`, so the UI
 * can show it as an editable suggestion rather than silently committing it.
 * Pure and DB-free on purpose: existence checks for brandProfileId/
 * assigneeId/approverId/existingCampaignId happen in the orchestrator
 * service, which has access to prisma — this function only shapes and
 * validates the STRUCTURE of the briefing.
 */
export function normalizeBriefing(briefing: MarketingBrainBriefing, now: Date = new Date()): NormalizedBriefing {
  const inferredFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let start = parseDate(briefing.startDate);
  if (!start) {
    start = now;
    inferredFields.push("startDate");
  }

  let end = parseDate(briefing.endDate);
  if (!end) {
    end = new Date(start.getTime() + DEFAULT_RANGE_DAYS * DAY_MS);
    inferredFields.push("endDate");
  }

  if (end.getTime() < start.getTime()) {
    errors.push("La fecha final es anterior a la fecha inicial.");
  } else if (end.getTime() - start.getTime() < MIN_RANGE_DAYS_WARNING * DAY_MS) {
    warnings.push(`El rango de campaña es muy corto (menos de ${MIN_RANGE_DAYS_WARNING} días) — puede no dar tiempo a distribuir el contenido.`);
  }

  if (parseDate(briefing.startDate) && start.getTime() < now.getTime() - DAY_MS) {
    warnings.push("La fecha inicial ya pasó.");
  }

  let timezone = briefing.timezone?.trim() || "";
  if (!timezone || !isKnownTimezone(timezone)) {
    if (timezone) warnings.push(`La zona horaria "${timezone}" no es reconocida — se usará UTC.`);
    timezone = "UTC";
    inferredFields.push("timezone");
  }

  const knownChannelIds = new Set(CAMPAIGN_CHANNELS.map((c) => c.id));
  let platforms = (briefing.platforms ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const unknownPlatforms = platforms.filter((p) => !knownChannelIds.has(p));
  platforms = platforms.filter((p) => knownChannelIds.has(p));
  if (unknownPlatforms.length > 0) {
    warnings.push(`Plataformas no reconocidas, ignoradas: ${unknownPlatforms.join(", ")}.`);
  }
  if (platforms.length === 0) {
    platforms = ["instagram"];
    inferredFields.push("platforms");
  }

  let language = briefing.language?.trim() || "";
  if (!language) {
    language = "es";
    inferredFields.push("language");
  }

  let objective = briefing.objective?.trim() || "";
  if (!objective) {
    objective = briefing.description?.trim() || "Aumentar la visibilidad y las conversiones.";
    inferredFields.push("objective");
  }

  let frequencyPerWeek = briefing.frequencyPerWeek ?? undefined;
  if (frequencyPerWeek === undefined || frequencyPerWeek === null || frequencyPerWeek <= 0) {
    frequencyPerWeek = 3;
    inferredFields.push("frequencyPerWeek");
  }

  const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const rangeWeeks = Math.max(1, Math.ceil(rangeDays / 7));

  let maxPieces = briefing.maxPieces ?? undefined;
  if (maxPieces === undefined || maxPieces === null || maxPieces <= 0) {
    maxPieces = Math.min(MAX_PIECES_HARD_CAP, Math.max(platforms.length, rangeWeeks * frequencyPerWeek));
    inferredFields.push("maxPieces");
  } else if (maxPieces > MAX_PIECES_HARD_CAP) {
    warnings.push(`Se solicitaron ${maxPieces} piezas — se limita al máximo permitido de ${MAX_PIECES_HARD_CAP}.`);
    maxPieces = MAX_PIECES_HARD_CAP;
  }

  let desiredFormats = briefing.desiredFormats ?? [];
  if (desiredFormats.length === 0) {
    desiredFormats = ["post"];
    inferredFields.push("desiredFormats");
  }

  const preferredDays = briefing.preferredDays ?? [];
  const preferredHours = briefing.preferredHours ?? [];

  if (!briefing.brandProfileId) {
    warnings.push("No se seleccionó un Brand Profile — la generación no tendrá contexto de marca.");
  }

  const requireApproval = briefing.requireApproval ?? false;
  if (requireApproval && !briefing.approverId) {
    warnings.push("Se requiere aprobación pero no se asignó un aprobador.");
  }

  const schedulingMode = briefing.schedulingMode ?? "manual";

  const campaignMode = briefing.campaignMode ?? "new";
  if ((campaignMode === "existing" || campaignMode === "duplicate") && !briefing.existingCampaignId) {
    errors.push("Selecciona una campaña existente para reutilizar o duplicar.");
  }

  return {
    productOrService: briefing.productOrService?.trim() ?? "",
    objective,
    description: briefing.description?.trim() ?? "",
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    timezone,
    platforms,
    brandProfileId: briefing.brandProfileId ?? null,
    language,
    campaignMode,
    existingCampaignId: briefing.existingCampaignId ?? null,

    audience: briefing.audience?.trim() ?? "",
    audienceLocation: briefing.audienceLocation?.trim() ?? "",
    audienceAgeRange: briefing.audienceAgeRange?.trim() ?? "",
    audienceInterests: briefing.audienceInterests ?? [],
    audiencePainPoints: briefing.audiencePainPoints ?? [],
    audienceNeeds: briefing.audienceNeeds ?? [],
    audienceObjections: briefing.audienceObjections ?? [],
    audienceAwareness: briefing.audienceAwareness?.trim() ?? "",
    valueProposition: briefing.valueProposition?.trim() ?? "",
    offer: briefing.offer?.trim() ?? "",
    primaryCTA: briefing.primaryCTA?.trim() ?? "",
    tone: briefing.tone?.trim() ?? "",
    forbiddenWords: briefing.forbiddenWords ?? [],
    competitors: briefing.competitors ?? [],
    budget: briefing.budget ?? null,
    targetMetrics: briefing.targetMetrics ?? [],
    frequencyPerWeek,
    preferredDays,
    preferredHours,
    desiredFormats,
    maxPieces,
    assigneeId: briefing.assigneeId ?? null,
    approverId: briefing.approverId ?? null,
    requireApproval,
    autoGenerateDrafts: briefing.autoGenerateDrafts ?? true,
    autoAdaptPlatforms: briefing.autoAdaptPlatforms ?? platforms.length > 1,
    autoCreatePublications: briefing.autoCreatePublications ?? true,
    schedulingMode,

    inferredFields,
    errors,
    warnings,
  };
}

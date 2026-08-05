/**
 * Centralized limits for every Fase 47 document-generation tool — no
 * component hides its own ceiling. Values keep in-memory PDF/canvas work
 * responsive on a typical phone while covering realistic real documents.
 */
export const DOCUMENT_LIMITS = {
  resume: { maxSections: 12, maxEntriesPerSection: 30, maxBulletsPerEntry: 12, maxSummaryChars: 800, maxPages: 4 },
  coverLetter: { maxParagraphChars: 1200, maxParagraphs: 8 },
  businessCard: { maxCardsPerSheet: 100 },
  businessDocument: { maxLines: 200 }, // receipts / purchase orders / delivery notes
  calendar: { maxEvents: 400, minYear: 1, maxYear: 9999, maxMonthsInRange: 12 },
  planner: { maxSections: 10, maxItemsPerSection: 60 },
  checklist: { maxSections: 30, maxItemsPerSection: 100, maxSubItemsPerItem: 20 },
  meeting: { maxTopics: 60, maxActions: 100, maxParticipants: 60 },
  certificate: { maxTextChars: 400 },
  labels: { maxLabels: 500, maxCsvRows: 500, maxCsvColumns: 40, maxCsvCellChars: 500 },
  image: { maxLogoBytes: 5 * 1024 * 1024, maxLogoDimension: 4000 },
  json: { maxBytes: 5 * 1024 * 1024, maxDepth: 12 },
  pngRenderScale: 2, // ~144 DPI — sharp enough to read, bounded enough to stay fast
  // Fase 48 — commerce/education/travel/cooking/household calculators, centralized here so no
  // component hides its own ceiling (spec section 29: "no escondas números diferentes en cada componente").
  breakEven: { maxProducts: 30, maxYears: 100 },
  roiRoas: { maxCashFlows: 600, maxYears: 100 },
  inventory: { maxSkuRows: 500 },
  productProfitability: { maxProducts: 200 },
  salesCommission: { maxTiers: 20, maxReps: 100 },
  unitPrice: { maxProducts: 20, minProducts: 2 },
  gpa: { maxCourses: 200, maxScalePoints: 30 },
  finalGrade: { maxCategories: 30 },
  fuelTrip: { maxLegs: 20, maxVehicles: 5, maxPassengers: 20 },
  recipe: { maxIngredients: 80, maxRecipes: 10 },
  electricity: { maxAppliances: 50, maxTariffBands: 10 },
  csv: { maxRows: 2000, maxColumns: 60, maxCellChars: 1000 },
  // Fase 49 — data formats, code formatting, security-web, and network tools. One central home for
  // every ceiling (spec section 13: "no ocultes límites diferentes dentro de componentes").
  dataFormats: {
    maxTextLength: 2_000_000,
    maxLines: 50_000,
    maxDepth: 100,
    maxKeys: 20_000,
    maxNodes: 50_000,
    yamlMaxAliasExpansion: 100, // matches the `yaml` library's own conservative default alias-count guard against "billion laughs"-style expansion
    yamlMaxDocuments: 50, // per parse, only when the visitor explicitly opts into multi-document mode
    xmlMaxElements: 20_000,
    xmlMaxAttributesPerElement: 200,
    xmlMaxDepth: 200,
    tomlMaxTables: 5_000,
  },
  codeFormatting: {
    maxSqlLength: 500_000,
    maxSqlStatements: 500,
    maxCodeLength: 1_000_000,
    workerTimeoutMs: 8_000,
  },
  jsonSchema: {
    maxSchemaLength: 1_000_000,
    maxInstanceLength: 2_000_000,
    maxErrors: 500,
    maxSchemaDepth: 100,
    workerTimeoutMs: 8_000,
  },
  jwt: {
    maxTokenLength: 20_000,
    maxClaimsBytes: 50_000,
    maxKeyLength: 20_000,
    clockToleranceSeconds: { min: 0, max: 86_400, default: 0 },
  },
  hmac: {
    maxMessageLength: 5_000_000,
    maxFileBytes: 100 * 1024 * 1024,
    maxSecretLength: 20_000,
  },
  csp: {
    maxDirectives: 60,
    maxSourcesPerDirective: 100,
  },
  securityHeaders: {
    maxHeaderLines: 500,
    maxHeaderValueLength: 20_000,
  },
  network: {
    maxSubnetDivisions: 4096, // hard ceiling on how many child subnets a single division can enumerate
    maxUrlLength: 100_000,
    maxUrlParams: 500,
  },
} as const;

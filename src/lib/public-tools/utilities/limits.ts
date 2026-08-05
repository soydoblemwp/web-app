/**
 * Centralized limits for the Fase 43 security/dev/converter/calculator
 * tools — mirrors the pattern of `files/limits.ts` from Fase 42 (spec
 * section 28: "no escondas límites diferentes en cada componente").
 */
export const UTILITY_LIMITS = {
  password: {
    minLength: 4,
    recommendedLength: 20,
    maxLength: 128,
    maxCount: 50,
  },
  passwordStrength: {
    maxLength: 256,
  },
  uuid: {
    maxCount: 1000,
  },
  hash: {
    maxTextLength: 5_000_000,
    maxFileBytes: 500 * 1024 * 1024,
  },
  json: {
    maxTextLength: 5_000_000,
    maxDepth: 200,
  },
  base64: {
    maxTextLength: 5_000_000,
    maxFileBytes: 25 * 1024 * 1024,
  },
  url: {
    maxTextLength: 100_000,
    maxParams: 200,
  },
  units: {
    maxPrecision: 15,
  },
  dates: {
    minYear: 1,
    maxYear: 9999,
  },
} as const;

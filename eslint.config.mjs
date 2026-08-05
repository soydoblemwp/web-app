import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local Playwright run artifacts (HTML report, traces, screenshots) — already gitignored, but
    // ESLint has no equivalent exclusion, so a local test run makes `npm run lint` scan bundled
    // third-party JS (trace viewer assets) that was never meant to be linted.
    "playwright-report/**",
    "test-results/**",
    // Vendored FFmpeg WASM core (spec Fase 45 section 10) — an unmodified copy of
    // @ffmpeg/core's build output served from our own origin, not app source code.
    "public/ffmpeg-core/**",
  ]),
]);

export default eslintConfig;

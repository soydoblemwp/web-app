import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves "server-only"/"client-only" to a no-op via its own
      // webpack/turbopack alias when compiling for the server — Vitest has no
      // such bundler-level alias, so tests that import a server module (e.g.
      // src/server/services/*, src/lib/integrations/*) need the same no-op
      // here. The real published packages unconditionally throw outside
      // Next's build, by design (see node_modules/server-only/index.js).
      "server-only": path.resolve(__dirname, "./tests/setup/server-only-stub.ts"),
      "client-only": path.resolve(__dirname, "./tests/setup/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/fake-indexeddb.ts"],
  },
});

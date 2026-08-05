/**
 * HTTP security-header generator (spec section 23). Profiles are starting
 * points the visitor reviews and edits — never presented as a universal or
 * "perfect" configuration. COOP/COEP/CORP and HSTS are never included
 * without an attached warning, since each can break OAuth popups, embedded
 * third-party iframes, cross-origin Workers, or (for HSTS) lock visitors
 * into HTTPS before it's confirmed fully ready.
 */
export type SecurityHeaderProfile = "static" | "webapp" | "api" | "custom";

export interface GeneratedHeader {
  name: string;
  value: string;
  warning?: string;
}

const HSTS_WARNING = "Solo actives HSTS después de confirmar que TODO tu sitio (todos los subdominios incluidos, si usas includeSubDomains) funciona correctamente por HTTPS: el navegador rechazará conexiones HTTP durante max-age, sin forma de deshacerlo rápidamente.";
const COOP_WARNING = "Cross-Origin-Opener-Policy puede romper flujos de autenticación basados en popups de origen cruzado (ej. algunos inicios de sesión OAuth) si no se revisan antes de activarla.";
const COEP_WARNING = "Cross-Origin-Embedder-Policy exige que TODO recurso de origen cruzado incrustado (imágenes, iframes, scripts de terceros) declare explícitamente Cross-Origin-Resource-Policy; puede romper recursos de terceros que no lo hagan.";
const CORP_WARNING = "Cross-Origin-Resource-Policy puede impedir que otros orígenes incrusten este recurso si eligen un valor más restrictivo del que necesitas.";

export function generateHeaderProfile(profile: SecurityHeaderProfile): GeneratedHeader[] {
  const base: GeneratedHeader[] = [
    { name: "X-Content-Type-Options", value: "nosniff" },
    { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];

  if (profile === "static") {
    return [
      ...base,
      { name: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';" },
      { name: "X-Frame-Options", value: "DENY" },
      { name: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains", warning: HSTS_WARNING },
      { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
  }
  if (profile === "webapp") {
    return [
      ...base,
      { name: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self';" },
      { name: "X-Frame-Options", value: "SAMEORIGIN" },
      { name: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains", warning: HSTS_WARNING },
      { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { name: "Cross-Origin-Opener-Policy", value: "same-origin", warning: COOP_WARNING },
      { name: "Cross-Origin-Embedder-Policy", value: "require-corp", warning: COEP_WARNING },
      { name: "Cross-Origin-Resource-Policy", value: "same-origin", warning: CORP_WARNING },
    ];
  }
  if (profile === "api") {
    return [
      { name: "X-Content-Type-Options", value: "nosniff" },
      { name: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none';" },
      { name: "Cache-Control", value: "no-store" },
      { name: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains", warning: HSTS_WARNING },
    ];
  }
  // "custom" — a minimal, safe starting point only.
  return base;
}

export type HeaderOutputFormat = "raw" | "nextjs" | "nginx" | "apache";

export function formatHeaders(headers: GeneratedHeader[], format: HeaderOutputFormat): string {
  if (format === "raw") {
    return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
  }
  if (format === "nginx") {
    return headers.map((h) => `add_header ${h.name} "${h.value.replace(/"/g, '\\"')}" always;`).join("\n");
  }
  if (format === "apache") {
    return headers.map((h) => `Header always set ${h.name} "${h.value.replace(/"/g, '\\"')}"`).join("\n");
  }
  // nextjs
  const entries = headers.map((h) => `        { key: "${h.name}", value: ${JSON.stringify(h.value)} },`).join("\n");
  return `// next.config.ts — ejemplo manual; revisa cada valor antes de usarlo en producción.
export default {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
${entries}
        ],
      },
    ];
  },
};`;
}

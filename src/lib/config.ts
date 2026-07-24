/**
 * Central product configuration. Change the product name/branding here only —
 * nothing else in the codebase should hardcode it.
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "AI Content Hub",
  shortName: "ACH",
  description:
    "Plataforma SaaS de asistente IA, contenido, SEO, redes sociales y automatización.",
  url: process.env.APP_URL ?? "http://localhost:3000",
  supportEmail: "soporte@example.com",
  defaultLocale: "es",
  defaultTimezone: "UTC",
} as const;

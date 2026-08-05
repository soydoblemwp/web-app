-- Fase 39 follow-up: adds the ANALYTICS value to PerformanceMetricCategory
-- (web analytics / organic search metrics — Google Analytics 4, Google
-- Search Console — genuinely distinct from the existing SOCIAL/CONTENT
-- categories). Split into its own tiny additive migration rather than
-- editing the just-applied 20260803090000_add_google_integrations_hub
-- migration in place, since this project's convention is to never modify an
-- already-applied migration file.

-- AlterEnum
ALTER TYPE "PerformanceMetricCategory" ADD VALUE 'ANALYTICS';

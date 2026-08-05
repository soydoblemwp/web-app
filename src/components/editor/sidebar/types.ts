import type { ContentStatus } from "@/generated/prisma/enums";

/** Metadata fields the sidebar's Resumen/SEO tabs edit — mirrors updateContentMetadataAction's input exactly (see src/server/actions/content.ts). */
export interface ContentMetadata {
  status: ContentStatus;
  channel: string;
  objective: string;
  tone: string;
  targetAudience: string;
  cta: string;
  seoKeyword: string;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  searchIntent: string;
  brandProfileId: string | null;
}

export interface VersionSummary {
  id: string;
  title: string;
  body: string;
  note: string | null;
  createdAt: string;
  authorName: string;
}

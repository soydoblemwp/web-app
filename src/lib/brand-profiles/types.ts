/**
 * Structural subset of a Prisma BrandProfile — kept minimal so this stays
 * decoupled from the generated client's include-shape, same convention as
 * SavedPromptLike/AiTemplateLike. Distinct from the existing per-project
 * BrandKit model (see prisma/schema.prisma's own comment on BrandProfile).
 */
export interface BrandProfileLike {
  id: string;
  name: string;
  description: string | null;
  mission: string | null;
  vision: string | null;
  values: string[];
  targetAudience: string | null;
  tone: string | null;
  personality: string | null;
  primaryLanguage: string | null;
  country: string | null;
  allowedWords: string[];
  forbiddenWords: string[];
  writingStyle: string | null;
  preferredCTAs: string[];
  socialLinks: string[];
  website: string | null;
  email: string | null;
  colors: string[];
  typography: string | null;
  logoUrl: string | null;
  internalNotes: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

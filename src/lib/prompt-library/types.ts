/**
 * Structural subset of a Prisma SavedPrompt — kept minimal so this stays
 * decoupled from the generated client's include-shape, same convention as
 * ContentItemLike in src/lib/ai-workspace/types.ts.
 */
export interface SavedPromptLike {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  content: string;
  category: string | null;
  tags: string[];
  isFavorite: boolean;
  sourceTool: string | null;
  useCount: number;
  lastUsedAt: Date | null;
  /** When true, "Usar" composes this prompt together with the user's default Brand Kit context. */
  useBrandKit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

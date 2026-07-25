/**
 * Structural subset of a Prisma AiTemplate — kept minimal so this stays
 * decoupled from the generated client's include-shape, same convention as
 * SavedPromptLike in src/lib/prompt-library/types.ts.
 */
export interface AiTemplateLike {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  content: string;
  variables: string[];
  category: string | null;
  tags: string[];
  isFavorite: boolean;
  sourceTool: string | null;
  createdAt: Date;
  updatedAt: Date;
}

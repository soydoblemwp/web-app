/** Closed vocabulary of collection icon names (spec section 5 examples: Marca, Productos, Investigación, Clientes, Campaña, Manuales, Recursos SEO, Políticas, Contenido publicado) — kept framework-free here so validation schemas don't need to import lucide-react; src/components/knowledge/collection-icon.tsx resolves these same names to real icon components. */
export const KNOWLEDGE_COLLECTION_ICON_NAMES = [
  "Folder",
  "Fingerprint",
  "Package",
  "Microscope",
  "Users",
  "Megaphone",
  "BookOpen",
  "Search",
  "ShieldCheck",
  "Send",
] as const;
export type KnowledgeCollectionIconName = (typeof KNOWLEDGE_COLLECTION_ICON_NAMES)[number];

export const KNOWLEDGE_COLLECTION_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
] as const;

import type { LucideIcon } from "lucide-react";

export type AiToolStatus = "available" | "coming-soon";

export interface AiTool {
  /** Stable and unique across the whole registry — used as the key for favorites/recent-use rows. */
  slug: string;
  label: string;
  description: string;
  status: AiToolStatus;
  /** Only present for "available" tools; builds the real, already-existing route for a given project. */
  href?: (projectId: string) => string;
}

export interface AiToolCategory {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tools: AiTool[];
}

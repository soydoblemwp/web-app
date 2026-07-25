import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { TIKTOK_AI_TOOLS } from "@/lib/ai-center/tools/tiktok";
import { FACEBOOK_AI_TOOLS } from "@/lib/ai-center/tools/facebook";
import { LINKEDIN_AI_TOOLS } from "@/lib/ai-center/tools/linkedin";
import { IMAGE_AI_TOOLS } from "@/lib/ai-center/tools/image-ai";
import { DOCUMENT_AI_TOOLS } from "@/lib/ai-center/tools/document-ai";
import { VIDEO_AI_TOOLS } from "@/lib/ai-center/tools/video-ai";

/**
 * Every implemented tool definition, across every platform. A future
 * Pinterest/Threads/X module adds its own file (like youtube.ts,
 * instagram.ts, social-media.ts, blog-seo.ts, email-marketing.ts,
 * tiktok.ts, facebook.ts, linkedin.ts, image-ai.ts, document-ai.ts or
 * video-ai.ts) and one line here — nothing else in this file changes, and
 * Chat IA's intent router (src/lib/chat/intent-router.ts) picks it up
 * automatically since it reads this list live.
 */
const ALL_TOOL_DEFINITIONS: AiToolDefinition[] = [
  ...YOUTUBE_TOOLS,
  ...INSTAGRAM_TOOLS,
  ...SOCIAL_MEDIA_TOOLS,
  ...BLOG_SEO_TOOLS,
  ...EMAIL_MARKETING_TOOLS,
  ...TIKTOK_AI_TOOLS,
  ...FACEBOOK_AI_TOOLS,
  ...LINKEDIN_AI_TOOLS,
  ...IMAGE_AI_TOOLS,
  ...DOCUMENT_AI_TOOLS,
  ...VIDEO_AI_TOOLS,
];

export function findToolDefinition(toolSlug: string): AiToolDefinition | undefined {
  return ALL_TOOL_DEFINITIONS.find((tool) => tool.slug === toolSlug);
}

/** Every routable tool definition, across every platform — used by the Chat IA intent router to know what it can route to. */
export function listToolDefinitions(): AiToolDefinition[] {
  return ALL_TOOL_DEFINITIONS;
}

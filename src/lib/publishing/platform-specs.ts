import type { SocialPlatform } from "@/generated/prisma/enums";

/**
 * One spec per platform driving the composer's counters/warnings (section 4)
 * and the preview cards (section 6). Every number here is a RECOMMENDATION
 * used for non-blocking warnings, never a hard limit — see
 * src/lib/publishing/composer-warnings.ts.
 */
export interface PlatformSpec {
  id: SocialPlatform;
  label: string;
  recommendedTextLength: number;
  recommendedHashtags: number;
  supportsMedia: boolean;
  requiresMedia: boolean;
  supportsFirstComment: boolean;
  aspectRatioHint: string | null;
}

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  INSTAGRAM: {
    id: "INSTAGRAM",
    label: "Instagram",
    recommendedTextLength: 2200,
    recommendedHashtags: 10,
    supportsMedia: true,
    requiresMedia: true,
    supportsFirstComment: true,
    aspectRatioHint: "1:1 o 4:5",
  },
  FACEBOOK: {
    id: "FACEBOOK",
    label: "Facebook",
    recommendedTextLength: 500,
    recommendedHashtags: 3,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: true,
    aspectRatioHint: "1.91:1",
  },
  TIKTOK: {
    id: "TIKTOK",
    label: "TikTok",
    recommendedTextLength: 2200,
    recommendedHashtags: 5,
    supportsMedia: true,
    requiresMedia: true,
    supportsFirstComment: true,
    aspectRatioHint: "9:16",
  },
  YOUTUBE: {
    id: "YOUTUBE",
    label: "YouTube",
    recommendedTextLength: 5000,
    recommendedHashtags: 5,
    supportsMedia: true,
    requiresMedia: true,
    supportsFirstComment: true,
    aspectRatioHint: "16:9",
  },
  YOUTUBE_SHORTS: {
    id: "YOUTUBE_SHORTS",
    label: "YouTube Shorts",
    recommendedTextLength: 1000,
    recommendedHashtags: 5,
    supportsMedia: true,
    requiresMedia: true,
    supportsFirstComment: true,
    aspectRatioHint: "9:16",
  },
  X: {
    id: "X",
    label: "X",
    recommendedTextLength: 280,
    recommendedHashtags: 2,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: false,
    aspectRatioHint: "16:9",
  },
  LINKEDIN: {
    id: "LINKEDIN",
    label: "LinkedIn",
    recommendedTextLength: 3000,
    recommendedHashtags: 5,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: true,
    aspectRatioHint: "1.91:1",
  },
  PINTEREST: {
    id: "PINTEREST",
    label: "Pinterest",
    recommendedTextLength: 500,
    recommendedHashtags: 5,
    supportsMedia: true,
    requiresMedia: true,
    supportsFirstComment: false,
    aspectRatioHint: "2:3",
  },
  BLOG: {
    id: "BLOG",
    label: "Blog",
    recommendedTextLength: 20000,
    recommendedHashtags: 0,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: false,
    aspectRatioHint: null,
  },
  EMAIL: {
    id: "EMAIL",
    label: "Email",
    recommendedTextLength: 3000,
    recommendedHashtags: 0,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: false,
    aspectRatioHint: null,
  },
  NEWSLETTER: {
    id: "NEWSLETTER",
    label: "Newsletter",
    recommendedTextLength: 5000,
    recommendedHashtags: 0,
    supportsMedia: true,
    requiresMedia: false,
    supportsFirstComment: false,
    aspectRatioHint: null,
  },
};

export const PLATFORM_VALUES = Object.keys(PLATFORM_SPECS) as SocialPlatform[];

/** The 10 channels the composer's platform picker shows, matching the spec's exact list (YouTube Shorts stays available but grouped under YouTube in the picker, not a separate top-level choice). */
export const COMPOSER_PLATFORM_VALUES: SocialPlatform[] = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "LINKEDIN",
  "YOUTUBE",
  "X",
  "PINTEREST",
  "BLOG",
  "EMAIL",
  "NEWSLETTER",
];

export function platformLabel(platform: string): string {
  return PLATFORM_SPECS[platform as SocialPlatform]?.label ?? platform;
}

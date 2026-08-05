import { createNotConfiguredAdapter } from "@/lib/publishing/providers/not-configured-adapter";
import type { PublishingProvider, PublishingProviderId } from "@/lib/publishing/providers/types";

const PROVIDER_LABELS: Record<PublishingProviderId, string> = {
  meta: "Meta (Instagram/Facebook)",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  pinterest: "Pinterest",
  wordpress: "WordPress",
  email: "Email",
};

const PROVIDERS: Record<PublishingProviderId, PublishingProvider> = Object.fromEntries(
  (Object.keys(PROVIDER_LABELS) as PublishingProviderId[]).map((id) => [id, createNotConfiguredAdapter(id, PROVIDER_LABELS[id])])
) as Record<PublishingProviderId, PublishingProvider>;

/** Maps a SocialPost.platform value to the provider adapter that would eventually publish it. */
export function providerIdForPlatform(platform: string): PublishingProviderId {
  switch (platform) {
    case "INSTAGRAM":
    case "FACEBOOK":
      return "meta";
    case "TIKTOK":
      return "tiktok";
    case "LINKEDIN":
      return "linkedin";
    case "YOUTUBE":
    case "YOUTUBE_SHORTS":
      return "youtube";
    case "X":
      return "x";
    case "PINTEREST":
      return "pinterest";
    case "BLOG":
      return "wordpress";
    case "EMAIL":
    case "NEWSLETTER":
      return "email";
    default:
      return "meta";
  }
}

export function getPublishingProvider(id: PublishingProviderId): PublishingProvider {
  return PROVIDERS[id];
}

export function listPublishingProviders(): PublishingProvider[] {
  return Object.values(PROVIDERS);
}

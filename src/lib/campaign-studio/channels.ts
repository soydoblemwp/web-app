/**
 * Wizard step 4's fixed channel list — broader than the Prisma SocialPlatform
 * enum (adds blog/email/newsletter, which are real campaign channels but
 * never become a SocialPost). Stored as free-form strings on Campaign.channels
 * and CampaignContentPiece.platform — see prisma/schema.prisma's comment on
 * Campaign.channels for why this isn't a DB enum.
 */
export interface CampaignChannelDefinition {
  id: string;
  label: string;
  /** Maps to the Prisma SocialPlatform enum when this channel can become a real scheduled SocialPost (see Fase 27's Publicación tab); omitted for blog/email/newsletter. */
  socialPlatform?: string;
}

export const CAMPAIGN_CHANNELS: CampaignChannelDefinition[] = [
  { id: "instagram", label: "Instagram", socialPlatform: "INSTAGRAM" },
  { id: "facebook", label: "Facebook", socialPlatform: "FACEBOOK" },
  { id: "tiktok", label: "TikTok", socialPlatform: "TIKTOK" },
  { id: "linkedin", label: "LinkedIn", socialPlatform: "LINKEDIN" },
  { id: "youtube", label: "YouTube", socialPlatform: "YOUTUBE" },
  { id: "x", label: "X" , socialPlatform: "X" },
  { id: "blog", label: "Blog" },
  { id: "email", label: "Email" },
  { id: "newsletter", label: "Newsletter" },
];

export function findCampaignChannel(id: string): CampaignChannelDefinition | undefined {
  return CAMPAIGN_CHANNELS.find((channel) => channel.id === id);
}

export function campaignChannelLabel(id: string): string {
  return findCampaignChannel(id)?.label ?? id;
}

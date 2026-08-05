import {
  PenLine,
  Search,
  Microscope,
  Share2,
  Megaphone,
  Fingerprint,
  Repeat,
  Rocket,
  Send,
  ShieldCheck,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { findAgentDefinition } from "@/lib/agents/registry";

/** Custom agents store their icon as a name string (can't persist a component reference) — this is the closed lookup used to render it, matching the same set official agents already use. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  PenLine,
  Search,
  Microscope,
  Share2,
  Megaphone,
  Fingerprint,
  Repeat,
  Rocket,
  Send,
  ShieldCheck,
  Bot,
};

export const CUSTOM_AGENT_ICON_NAMES = Object.keys(ICON_BY_NAME);

export function resolveAgentIcon(agentRef: string, customIconName?: string | null): LucideIcon {
  const official = findAgentDefinition(agentRef);
  if (official) return official.icon;
  if (customIconName && ICON_BY_NAME[customIconName]) return ICON_BY_NAME[customIconName];
  return Bot;
}

export function AgentIcon({ agentRef, customIconName, className }: { agentRef: string; customIconName?: string | null; className?: string }) {
  const official = findAgentDefinition(agentRef);
  const Icon = official ? official.icon : (customIconName && ICON_BY_NAME[customIconName]) || Bot;
  return <Icon className={className ?? "size-4"} />;
}

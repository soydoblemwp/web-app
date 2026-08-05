import { Folder, Fingerprint, Package, Microscope, Users, Megaphone, BookOpen, Search, ShieldCheck, Send, type LucideIcon } from "lucide-react";
import type { KnowledgeCollectionIconName } from "@/lib/knowledge/collection-icons";

const ICON_BY_NAME: Record<KnowledgeCollectionIconName, LucideIcon> = {
  Folder,
  Fingerprint,
  Package,
  Microscope,
  Users,
  Megaphone,
  BookOpen,
  Search,
  ShieldCheck,
  Send,
};

export function CollectionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_BY_NAME[name as KnowledgeCollectionIconName] ?? Folder;
  return <Icon className={className ?? "size-4"} />;
}

"use client";

import { useRouter } from "next/navigation";
import { BrandProfileCreateForm } from "@/components/brand-profiles/brand-profile-create-form";
import { BrandProfileCard } from "@/components/brand-profiles/brand-profile-card";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";

/** Lists every Brand Kit the user owns (default sorts first — see listBrandProfilesForUser) with the create form above the list, same shape as PromptLibraryHub/AiTemplateHub. */
export function BrandProfileHub({ projectId, profiles }: { projectId: string; profiles: BrandProfileLike[] }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <BrandProfileCreateForm projectId={projectId} onCreated={() => router.refresh()} />

      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tienes ningún Brand Kit. Crea el primero para empezar.</p>
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <BrandProfileCard key={profile.id} projectId={projectId} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}

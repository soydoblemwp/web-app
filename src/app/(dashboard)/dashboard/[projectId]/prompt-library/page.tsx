import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listSavedPromptsForUser } from "@/server/services/prompt-library";
import { getDefaultBrandProfileForUser } from "@/server/services/brand-profiles";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { PromptLibraryHub } from "@/components/prompt-library/prompt-library-hub";

export const metadata: Metadata = { title: "Prompt Library" };

export default async function PromptLibraryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const [prompts, defaultBrandProfile] = await Promise.all([
    listSavedPromptsForUser(user.id, projectId),
    getDefaultBrandProfileForUser(user.id),
  ]);
  const defaultBrandContext = defaultBrandProfile ? buildBrandProfileContext(defaultBrandProfile) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prompt Library</h1>
        <p className="text-sm text-muted-foreground">
          Tu biblioteca personal de prompts: guarda, reutiliza, organiza y busca los prompts que mejor te funcionan.
        </p>
      </div>
      <PromptLibraryHub projectId={projectId} prompts={prompts} defaultBrandContext={defaultBrandContext} />
    </div>
  );
}

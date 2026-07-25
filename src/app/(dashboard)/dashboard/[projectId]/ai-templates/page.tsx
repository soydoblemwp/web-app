import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/permissions";
import { listAiTemplatesForUser } from "@/server/services/ai-templates";
import { getDefaultBrandProfileForUser } from "@/server/services/brand-profiles";
import { buildBrandProfileTemplateVariables } from "@/lib/brand-profiles/context";
import { AiTemplateHub } from "@/components/ai-templates/ai-template-hub";

export const metadata: Metadata = { title: "AI Templates" };

export default async function AiTemplatesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");

  const [templates, defaultBrandProfile] = await Promise.all([
    listAiTemplatesForUser(user.id, projectId),
    getDefaultBrandProfileForUser(user.id),
  ]);
  const brandVariables = defaultBrandProfile ? buildBrandProfileTemplateVariables(defaultBrandProfile) : {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Templates</h1>
        <p className="text-sm text-muted-foreground">
          Convierte cualquier generación de IA en una plantilla reutilizable con variables {"{{como_esta}}"}.
        </p>
      </div>
      <AiTemplateHub projectId={projectId} templates={templates} brandVariables={brandVariables} />
    </div>
  );
}

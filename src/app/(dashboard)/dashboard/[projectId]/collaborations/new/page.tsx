import type { Metadata } from "next";
import { CreateCollaborationForm } from "@/components/collaborations/create-collaboration-form";

export const metadata: Metadata = { title: "Nueva colaboración" };

export default async function NewCollaborationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nueva colaboración</h1>
      <CreateCollaborationForm projectId={projectId} />
    </div>
  );
}

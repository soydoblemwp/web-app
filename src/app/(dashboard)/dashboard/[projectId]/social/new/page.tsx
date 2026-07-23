import type { Metadata } from "next";
import { CreateSocialPostForm } from "@/components/social/create-social-post-form";

export const metadata: Metadata = { title: "Nueva publicación" };

export default async function NewSocialPostPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva publicación</h1>
        <p className="text-sm text-muted-foreground">Crea el borrador de una publicación para una red social.</p>
      </div>
      <CreateSocialPostForm projectId={projectId} />
    </div>
  );
}

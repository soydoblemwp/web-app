import type { Metadata } from "next";
import { PostAnalyzerForm } from "@/components/content/post-analyzer-form";

export const metadata: Metadata = { title: "Analizador de publicaciones" };

export default function SocialAnalyzerPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analizador de publicaciones</h1>
        <p className="text-sm text-muted-foreground">
          Comprobaciones deterministas (longitud, gancho, hashtags, CTA, repetición) calculadas en tu navegador
          antes de publicar.
        </p>
      </div>
      <PostAnalyzerForm />
    </div>
  );
}

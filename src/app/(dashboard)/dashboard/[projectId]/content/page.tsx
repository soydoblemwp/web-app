import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Plus, Star } from "lucide-react";
import { listContentItems } from "@/server/services/content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Contenido" };

export default async function ContentLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; favorite?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  const items = await listContentItems(projectId, {
    status: query.status as never,
    favoriteOnly: query.favorite === "1",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contenido</h1>
          <p className="text-sm text-muted-foreground">Biblioteca de contenido generado y editado para este proyecto.</p>
        </div>
        <Button
          render={
            <Link href={`/dashboard/${projectId}/content/new`}>
              <Plus className="mr-1 size-4" /> Generar contenido
            </Link>
          }
        />
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">Todavía no hay contenido</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Genera tu primera pieza de contenido con el asistente de IA o créala manualmente.
            </p>
            <Button
              className="mt-2"
              render={
                <Link href={`/dashboard/${projectId}/content/new`}>
                  <Plus className="mr-1 size-4" /> Generar contenido
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} href={`/dashboard/${projectId}/content/${item.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{item.title}</p>
                    {item.isFavorite ? <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" /> : null}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{item.body || "Sin contenido."}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="secondary">{item.type}</Badge>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

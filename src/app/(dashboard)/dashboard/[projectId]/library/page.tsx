import Link from "next/link";
import type { Metadata } from "next";
import { Library, Star, Plus, FolderClosed } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { listContentItems } from "@/server/services/content";
import { createFolderAction, deleteFolderAction } from "@/server/actions/folder";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Biblioteca" };

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string; favorite?: string }>;
}) {
  const { projectId } = await params;
  const { q, favorite } = await searchParams;

  const [items, folders] = await Promise.all([
    listContentItems(projectId, { search: q, favoriteOnly: favorite === "1" }),
    prisma.folder.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de contenido</h1>
        <p className="text-sm text-muted-foreground">Busca, filtra y organiza todo el contenido guardado del proyecto.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderClosed className="size-4" /> Colecciones
              </div>
              <form action={createFolderAction.bind(null, projectId)} className="flex gap-1">
                <Input name="name" placeholder="Nueva colección" className="h-8 text-xs" />
                <Button type="submit" size="icon" variant="outline" className="size-8 shrink-0">
                  <Plus className="size-3.5" />
                </Button>
              </form>
              {folders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin colecciones todavía.</p>
              ) : (
                <ul className="space-y-1">
                  {folders.map((folder) => (
                    <li key={folder.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{folder.name}</span>
                      <form action={deleteFolderAction.bind(null, projectId, folder.id)}>
                        <button type="submit" className="text-muted-foreground hover:text-destructive">
                          ×
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <form className="flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Buscar por título..." />
            <Button type="submit" variant="outline">
              Buscar
            </Button>
            <Button type="submit" name="favorite" value={favorite === "1" ? "0" : "1"} variant="outline">
              <Star className={favorite === "1" ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
            </Button>
          </form>

          {items.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Library className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No se ha encontrado contenido.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <Link key={item.id} href={`/dashboard/${projectId}/content/${item.id}`}>
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardContent className="space-y-1 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{item.title}</p>
                        {item.isFavorite ? <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" /> : null}
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.type}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

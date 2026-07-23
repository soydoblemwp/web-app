import Link from "next/link";
import type { Metadata } from "next";
import { Share2, Plus } from "lucide-react";
import { listSocialPosts } from "@/server/services/social";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Redes sociales" };

export default async function SocialPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const posts = await listSocialPosts(projectId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Publicaciones</h1>
          <p className="text-sm text-muted-foreground">Gestiona el contenido para tus redes sociales.</p>
        </div>
        <Button
          render={
            <Link href={`/dashboard/${projectId}/social/new`}>
              <Plus className="mr-1 size-4" /> Nueva publicación
            </Link>
          }
        />
      </div>

      {posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Share2 className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">Sin publicaciones todavía</h2>
            <Button
              className="mt-2"
              render={
                <Link href={`/dashboard/${projectId}/social/new`}>
                  <Plus className="mr-1 size-4" /> Crear publicación
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Plataforma</th>
                <th className="px-4 py-2 font-medium">Texto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Programada</th>
                <th className="px-4 py-2 font-medium">Campaña</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/${projectId}/social/${post.id}`} className="font-medium hover:underline">
                      {post.platform}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">{post.text}</td>
                  <td className="px-4 py-2">
                    <Badge variant="secondary">{post.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {post.scheduledAt ? post.scheduledAt.toLocaleString("es-ES") : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{post.campaign?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

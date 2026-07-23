import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Copy, Trash2 } from "lucide-react";
import { getSocialPost } from "@/server/services/social";
import {
  updateSocialPostAction,
  duplicateSocialPostAction,
  deleteSocialPostAction,
  addSocialMetricAction,
} from "@/server/actions/social";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialPostStatusSelect } from "@/components/social/social-post-status-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Publicación" };

export default async function SocialPostDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; postId: string }>;
}) {
  const { projectId, postId } = await params;
  const post = await getSocialPost(postId);
  if (!post || post.projectId !== projectId) notFound();

  const saveAction = updateSocialPostAction.bind(null, projectId);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary">{post.platform}</Badge>
            <Badge variant="outline">{post.postType}</Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{post.internalTitle || "Publicación sin título"}</h1>
          {post.scheduledAt ? (
            <p className="text-xs text-muted-foreground">Programada: {post.scheduledAt.toLocaleString("es-ES")}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <form action={duplicateSocialPostAction.bind(null, projectId, post.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Duplicar">
              <Copy className="size-4" />
            </Button>
          </form>
          <form action={deleteSocialPostAction.bind(null, projectId, post.id)}>
            <Button type="submit" variant="outline" size="icon" aria-label="Eliminar">
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Estado</Label>
        <SocialPostStatusSelect projectId={projectId} postId={post.id} status={post.status} />
      </div>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="id" value={post.id} />
        <div className="space-y-2">
          <Label htmlFor="internalTitle">Título interno</Label>
          <Input id="internalTitle" name="internalTitle" defaultValue={post.internalTitle ?? ""} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="text">Texto</Label>
          <Textarea id="text" name="text" defaultValue={post.text} rows={8} maxLength={10_000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" defaultValue={post.notes ?? ""} rows={2} maxLength={2000} />
        </div>
        <Button type="submit">Guardar cambios</Button>
      </form>

      {post.hashtags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados (registrados manualmente)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={addSocialMetricAction.bind(null, projectId, post.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Input name="views" type="number" min={0} placeholder="Vistas" />
            <Input name="likes" type="number" min={0} placeholder="Me gusta" />
            <Input name="comments" type="number" min={0} placeholder="Comentarios" />
            <Input name="shares" type="number" min={0} placeholder="Compartidos" />
            <Input name="clicks" type="number" min={0} placeholder="Clics" />
            <Button type="submit" size="sm" className="col-span-2 sm:col-span-5">
              Registrar resultado
            </Button>
          </form>
          {post.metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin resultados registrados. Estos datos siempre se introducen manualmente o se importan — nunca se
              inventan.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {post.metrics.map((metric) => (
                <li key={metric.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {metric.recordedAt.toLocaleString("es-ES")} · fuente: {metric.source}
                  </span>
                  <span>
                    {metric.views ?? 0} vistas · {metric.likes ?? 0} me gusta · {metric.comments ?? 0} comentarios ·{" "}
                    {metric.shares ?? 0} compartidos · {metric.clicks ?? 0} clics
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

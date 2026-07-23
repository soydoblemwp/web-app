import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { deleteCampaignAction } from "@/server/actions/campaign";
import { CampaignStatusSelect } from "@/components/campaigns/campaign-status-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Campaña" };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; campaignId: string }>;
}) {
  const { projectId, campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { posts: true, contents: { include: { contentItem: true } } },
  });
  if (!campaign || campaign.projectId !== projectId) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{campaign.description}</p>
        </div>
        <form action={deleteCampaignAction.bind(null, projectId, campaign.id)}>
          <Button type="submit" variant="outline" size="icon" aria-label="Eliminar">
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Estado</Label>
        <CampaignStatusSelect projectId={projectId} campaignId={campaign.id} status={campaign.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicaciones ({campaign.posts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {campaign.posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin publicaciones asociadas todavía.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {campaign.posts.map((post) => (
                  <li key={post.id}>
                    <Link href={`/dashboard/${projectId}/social/${post.id}`} className="hover:underline">
                      {post.platform}: {post.internalTitle || post.text.slice(0, 40)}
                    </Link>
                    <Badge variant="outline" className="ml-2">
                      {post.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contenidos ({campaign.contents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {campaign.contents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin contenidos asociados. Vincula contenido desde la biblioteca próximamente.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {campaign.contents.map(({ contentItem }) => (
                  <li key={contentItem.id}>
                    <Link href={`/dashboard/${projectId}/content/${contentItem.id}`} className="hover:underline">
                      {contentItem.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

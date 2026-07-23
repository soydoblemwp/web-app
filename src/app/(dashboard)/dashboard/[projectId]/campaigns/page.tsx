import Link from "next/link";
import type { Metadata } from "next";
import { Megaphone, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const campaigns = await prisma.campaign.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { posts: true, contents: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
          <p className="text-sm text-muted-foreground">Planifica y sigue el progreso de tus campañas.</p>
        </div>
        <Button
          render={
            <Link href={`/dashboard/${projectId}/campaigns/new`}>
              <Plus className="mr-1 size-4" /> Nueva campaña
            </Link>
          }
        />
      </div>

      {campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Megaphone className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">Sin campañas todavía</h2>
            <Button
              className="mt-2"
              render={
                <Link href={`/dashboard/${projectId}/campaigns/new`}>
                  <Plus className="mr-1 size-4" /> Crear campaña
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Link key={campaign.id} href={`/dashboard/${projectId}/campaigns/${campaign.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p className="line-clamp-2">{campaign.description || "Sin descripción."}</p>
                  <p className="mt-2 text-xs">
                    {campaign._count.posts} publicaciones · {campaign._count.contents} contenidos
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

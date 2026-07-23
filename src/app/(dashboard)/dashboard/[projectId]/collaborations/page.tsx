import Link from "next/link";
import type { Metadata } from "next";
import { Handshake, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Colaboraciones" };

export default async function CollaborationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const collaborations = await prisma.collaboration.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colaboraciones</h1>
          <p className="text-sm text-muted-foreground">Seguimiento de colaboraciones con marcas.</p>
        </div>
        <Button
          render={
            <Link href={`/dashboard/${projectId}/collaborations/new`}>
              <Plus className="mr-1 size-4" /> Nueva colaboración
            </Link>
          }
        />
      </div>

      {collaborations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Handshake className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin colaboraciones todavía.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collaborations.map((collab) => (
            <Link key={collab.id} href={`/dashboard/${projectId}/collaborations/${collab.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{collab.brandName}</p>
                    <Badge variant="secondary">{collab.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{collab.collaborationType || "Sin tipo definido"}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

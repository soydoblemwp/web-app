"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import { recordApprovalDecisionAction } from "@/server/actions/publishing";
import { platformLabel } from "@/lib/publishing/platform-specs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { PublicationData } from "@/components/publishing/types";

export function ApprovalsView({ projectId, publications }: { projectId: string; publications: PublicationData[] }) {
  const router = useRouter();
  const pending = publications.filter((p) => p.status === "IN_REVIEW" || p.status === "CHANGES_REQUESTED");
  const [comments, setComments] = useState<Record<string, string>>({});

  async function decide(id: string, action: "APPROVED" | "CHANGES_REQUESTED") {
    const result = await recordApprovalDecisionAction(projectId, id, { action, comment: comments[id] ?? "" });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Registrado.");
    router.refresh();
  }

  if (pending.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">No hay publicaciones pendientes de aprobación.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {pending.map((post) => (
        <Card key={post.id}>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/dashboard/${projectId}/publishing/${post.id}`} className="truncate text-sm font-medium hover:underline">
                {post.internalTitle || "Sin título"}
              </Link>
              <Badge variant="outline">{platformLabel(post.platform)}</Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{post.text || "Sin texto todavía."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={comments[post.id] ?? ""}
                onChange={(e) => setComments((prev) => ({ ...prev, [post.id]: e.target.value }))}
                placeholder="Comentario (opcional)"
                className="h-8 flex-1"
              />
              <Button type="button" size="sm" onClick={() => decide(post.id, "APPROVED")}>
                <Check className="size-3.5" /> Aprobar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => decide(post.id, "CHANGES_REQUESTED")}>
                <RotateCcw className="size-3.5" /> Solicitar cambios
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

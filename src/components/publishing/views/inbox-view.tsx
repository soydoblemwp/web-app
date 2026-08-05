"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { duplicatePublicationAction, recordApprovalDecisionAction, cancelSchedulingAction } from "@/server/actions/publishing";
import { platformLabel } from "@/lib/publishing/platform-specs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, RotateCcw, X } from "lucide-react";
import type { PublicationData } from "@/components/publishing/types";

interface Group {
  id: string;
  label: string;
  items: PublicationData[];
}

export function InboxView({ projectId, publications, currentUserId }: { projectId: string; publications: PublicationData[]; currentUserId: string }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const weekMs = 1000 * 60 * 60 * 24 * 7;

  const groups: Group[] = [
    { id: "my-drafts", label: "Mis borradores", items: publications.filter((p) => p.status === "DRAFT" && p.authorId === currentUserId) },
    { id: "awaiting-my-review", label: "Esperando mi revisión", items: publications.filter((p) => p.status === "IN_REVIEW" && p.approverId === currentUserId) },
    { id: "changes-requested", label: "Cambios solicitados", items: publications.filter((p) => p.status === "CHANGES_REQUESTED") },
    { id: "approved-unscheduled", label: "Aprobadas sin programar", items: publications.filter((p) => p.status === "APPROVED" && !p.scheduledAt) },
    {
      id: "scheduled-soon",
      label: "Programadas próximas",
      items: publications.filter((p) => p.status === "SCHEDULED" && p.scheduledAt && new Date(p.scheduledAt).getTime() >= now),
    },
    { id: "failed", label: "Fallidas", items: publications.filter((p) => p.status === "FAILED") },
    {
      id: "recently-published",
      label: "Publicadas recientemente",
      items: publications.filter((p) => p.status === "PUBLISHED" && p.publishedAt && now - new Date(p.publishedAt).getTime() < weekMs),
    },
  ];

  async function handleDuplicate(id: string) {
    const result = await duplicatePublicationAction(projectId, id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Publicación duplicada.");
      router.refresh();
    }
  }

  async function handleApprove(id: string) {
    const result = await recordApprovalDecisionAction(projectId, id, { action: "APPROVED" });
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  async function handleRequestChanges(id: string) {
    const result = await recordApprovalDecisionAction(projectId, id, { action: "CHANGES_REQUESTED" });
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  async function handleCancel(id: string) {
    const result = await cancelSchedulingAction(projectId, id);
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  const nonEmptyGroups = groups.filter((g) => g.items.length > 0);

  if (nonEmptyGroups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Tu bandeja está vacía por ahora.</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {nonEmptyGroups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              {group.label} <Badge variant="outline">{group.items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {group.items.slice(0, 8).map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <Link href={`/dashboard/${projectId}/publishing/${post.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {post.internalTitle || "Sin título"} <span className="text-muted-foreground">· {platformLabel(post.platform)}</span>
                </Link>
                <div className="flex shrink-0 gap-1">
                  {group.id === "awaiting-my-review" ? (
                    <>
                      <Button type="button" variant="ghost" size="icon-xs" title="Aprobar" onClick={() => handleApprove(post.id)}>
                        <Check className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" title="Solicitar cambios" onClick={() => handleRequestChanges(post.id)}>
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </>
                  ) : null}
                  {group.id === "scheduled-soon" ? (
                    <Button type="button" variant="ghost" size="icon-xs" title="Cancelar programación" onClick={() => handleCancel(post.id)}>
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon-xs" title="Duplicar" onClick={() => handleDuplicate(post.id)}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

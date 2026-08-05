"use client";

import type { Editor } from "@tiptap/react";
import { estimateReadingTimeMinutes } from "@/lib/editor/reading-time";
import { CONTENT_STATUS_VALUES, CONTENT_STATUS_LABELS, estimateContentProgress } from "@/lib/editor/content-status";
import { computeChecklistProgress, parsePublishPlan } from "@/lib/editor/publish-checklist";
import { BrandProfileSelect } from "@/components/brand-profiles/brand-profile-select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContentMetadata } from "@/components/editor/sidebar/types";
import type { ContentStatus } from "@/generated/prisma/enums";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";

export function SummaryTab({
  projectId,
  editor,
  title,
  authorName,
  updatedAt,
  metadata,
  publishChecklistRaw,
  onMetadataChange,
  onBrandProfileResolved,
}: {
  projectId: string;
  editor: Editor | null;
  title: string;
  authorName: string;
  updatedAt: string;
  metadata: ContentMetadata;
  publishChecklistRaw: unknown;
  onMetadataChange: (patch: Partial<ContentMetadata>) => void;
  /** Bubbles the full resolved profile (not just its id) up to the sidebar, which composes it into the AI context every other tab uses. */
  onBrandProfileResolved?: (profile: BrandProfileLike | null) => void;
}) {
  const words = editor?.storage.characterCount?.words() ?? 0;
  const characters = editor?.storage.characterCount?.characters() ?? 0;
  const readingTime = estimateReadingTimeMinutes(words);
  const checklistProgress = computeChecklistProgress(parsePublishPlan(publishChecklistRaw).checklist);
  const progress = estimateContentProgress(metadata.status, checklistProgress);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Título</p>
        <p className="text-sm font-medium">{title || "Sin título"}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary-status" className="text-xs">
          Estado
        </Label>
        <Select value={metadata.status} onValueChange={(value) => value && onMetadataChange({ status: value as ContentStatus })}>
          <SelectTrigger id="summary-status" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {CONTENT_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progreso</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Palabras</dt>
          <dd className="font-medium">{words}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Caracteres</dt>
          <dd className="font-medium">{characters}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lectura</dt>
          <dd className="font-medium">{readingTime} min</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Autor</dt>
          <dd className="truncate font-medium" title={authorName}>
            {authorName}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Última edición</dt>
          <dd className="font-medium">{new Date(updatedAt).toLocaleString("es-ES")}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="summary-channel" className="text-xs">
          Canal / plataforma
        </Label>
        <Input
          id="summary-channel"
          value={metadata.channel}
          onChange={(e) => onMetadataChange({ channel: e.target.value })}
          placeholder="Blog, Instagram, Email..."
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary-objective" className="text-xs">
          Objetivo del contenido
        </Label>
        <Input
          id="summary-objective"
          value={metadata.objective}
          onChange={(e) => onMetadataChange({ objective: e.target.value })}
          placeholder="Educar, vender, fidelizar..."
          maxLength={500}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary-tone" className="text-xs">
          Tono
        </Label>
        <Input
          id="summary-tone"
          value={metadata.tone}
          onChange={(e) => onMetadataChange({ tone: e.target.value })}
          placeholder="Cercano, profesional..."
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Brand Profile utilizado</Label>
        <BrandProfileSelect
          projectId={projectId}
          initialProfileId={metadata.brandProfileId}
          onContextChange={() => {}}
          onProfileChange={(profile) => {
            onMetadataChange({ brandProfileId: profile?.id ?? null });
            onBrandProfileResolved?.(profile);
          }}
        />
      </div>
    </div>
  );
}

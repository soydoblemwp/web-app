"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { platformLabel } from "@/lib/publishing/platform-specs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicationData } from "@/components/publishing/types";

/**
 * ONE flexible preview, not 11 pixel-perfect clones — spec section 6 is
 * explicit that these "no deben pretender ser reproducciones exactas",
 * only a coherent representation of text/user/media/CTA/hashtags/date/
 * format. Layout adapts by platform via a small set of shape variants.
 */
export function PublicationPreview({
  publication,
  brandName,
}: {
  publication: Pick<PublicationData, "platform" | "format" | "text" | "hashtags" | "cta" | "media" | "scheduledAt" | "timezone">;
  brandName: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile");
  const isStoryLike = ["INSTAGRAM", "TIKTOK", "YOUTUBE_SHORTS"].includes(publication.platform) && (publication.format ?? "").match(/story|reel|short/i);
  const isVertical = isStoryLike || publication.platform === "TIKTOK" || publication.platform === "PINTEREST";
  const isDocumentLike = ["EMAIL", "NEWSLETTER", "BLOG"].includes(publication.platform);
  const media = publication.media[0]?.fileAsset;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{platformLabel(publication.platform)}{publication.format ? ` · ${publication.format}` : ""}</Badge>
        {!isDocumentLike ? (
          <div className="flex gap-1">
            <Button type="button" variant={device === "desktop" ? "secondary" : "ghost"} size="icon-xs" onClick={() => setDevice("desktop")} aria-label="Vista escritorio">
              <Monitor className="size-3.5" />
            </Button>
            <Button type="button" variant={device === "mobile" ? "secondary" : "ghost"} size="icon-xs" onClick={() => setDevice("mobile")} aria-label="Vista móvil">
              <Smartphone className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card",
          device === "mobile" ? "mx-auto w-full max-w-[280px]" : "w-full max-w-md",
          isDocumentLike && "max-w-full"
        )}
      >
        {isDocumentLike ? (
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold text-muted-foreground">{brandName}</p>
            <div className="whitespace-pre-wrap text-sm">{publication.text || <span className="text-muted-foreground">Sin contenido todavía.</span>}</div>
            {publication.cta ? (
              <span className="inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{publication.cta}</span>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {brandName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{brandName}</p>
                {publication.scheduledAt ? (
                  <p className="text-[10px] text-muted-foreground">{new Date(publication.scheduledAt).toLocaleString("es-ES")}</p>
                ) : null}
              </div>
            </div>

            <div className={cn("flex items-center justify-center bg-muted", isVertical ? "aspect-[9/16]" : "aspect-square")}>
              {media ? (
                media.mimeType.startsWith("video") ? (
                  <video src={media.url} className="size-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media.url} alt={media.altText ?? ""} className="size-full object-cover" />
                )
              ) : (
                <span className="text-xs text-muted-foreground">Sin medios</span>
              )}
            </div>

            <div className="space-y-1.5 p-2.5">
              <p className="line-clamp-4 whitespace-pre-wrap text-xs">{publication.text || <span className="text-muted-foreground">Sin texto todavía.</span>}</p>
              {publication.hashtags.length > 0 ? (
                <p className="text-xs text-primary">{publication.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
              ) : null}
              {publication.cta ? <p className="text-xs font-medium">{publication.cta} →</p> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

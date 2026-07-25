import type { ResultBlock } from "@/lib/ai-workspace/blocks";
import { parseInlineSegments } from "@/lib/ai-workspace/blocks";

/**
 * Only "text" is implemented today. The other kinds are already accepted so
 * a future image/PDF/audio/video-producing tool can plug into this same
 * viewer without changing its prop contract — they currently render a
 * plain "not supported yet" notice instead of crashing.
 */
export type ResultMediaKind = "text" | "image" | "pdf" | "audio" | "video";

const UNSUPPORTED_MEDIA_LABEL: Record<Exclude<ResultMediaKind, "text">, string> = {
  image: "Imagen",
  pdf: "PDF",
  audio: "Audio",
  video: "Vídeo",
};

/** Renders inline text with any markdown/bare-URL links turned into real, safe <a> tags. */
function InlineText({ text }: { text: string }) {
  const segments = parseInlineSegments(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {segment.content}
          </a>
        ) : (
          <span key={index}>{segment.content}</span>
        )
      )}
    </>
  );
}

/**
 * Renders one generated result's content. Platform-agnostic and reused by
 * every tool's history entry and every Chat IA message — YouTube today, any
 * future platform tomorrow, one visual system for all of them.
 */
export function UniversalResultViewer({
  blocks,
  mediaKind = "text",
}: {
  blocks: ResultBlock[];
  mediaKind?: ResultMediaKind;
}) {
  if (mediaKind !== "text") {
    return (
      <p className="text-sm text-muted-foreground">
        Resultado de tipo {UNSUPPORTED_MEDIA_LABEL[mediaKind]} — este visor todavía no lo soporta.
      </p>
    );
  }

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin contenido.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre key={index} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              <code>{block.content}</code>
            </pre>
          );
        }
        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <InlineText text={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        if (block.kind === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-left">
                <thead className="bg-muted">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={headerIndex} className="border-b px-3 py-1.5 font-medium">
                        <InlineText text={header} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-1.5">
                          <InlineText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={index} className="border-l-2 border-primary/50 pl-3 text-muted-foreground italic">
              <InlineText text={block.content} />
            </blockquote>
          );
        }
        if (block.kind === "heading") {
          return (
            <h3 key={index} className="font-medium">
              <InlineText text={block.content} />
            </h3>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <InlineText text={block.content} />
          </p>
        );
      })}
    </div>
  );
}

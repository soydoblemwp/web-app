import { Cpu, Server, ShieldCheck, Film, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicToolExecutionType } from "@/lib/public-tools/types";

const COPY: Record<PublicToolExecutionType, { label: string; privacy: string; Icon: typeof Cpu }> = {
  DETERMINISTIC: {
    label: "Procesamiento en tu dispositivo, sin IA",
    privacy: "El contenido se procesa en tu dispositivo y no se sube al servidor.",
    Icon: ShieldCheck,
  },
  LOCAL_AI: {
    label: "IA local en tu navegador",
    privacy: "El contenido se procesa en tu dispositivo mediante IA local. No se envía a ningún servidor ni proveedor externo.",
    Icon: Cpu,
  },
  HYBRID: {
    label: "Reglas locales + IA local opcional",
    privacy: "El contenido se procesa en tu dispositivo. La corrección/resumen avanzado, cuando se usa, también se ejecuta con IA local, nunca en un servidor externo.",
    Icon: Server,
  },
  LOCAL_MEDIA: {
    label: "Procesamiento multimedia en tu dispositivo (FFmpeg WebAssembly)",
    privacy: "Tus archivos se procesan en tu dispositivo y no se suben al servidor.",
    Icon: Film,
  },
  LOCAL_RECORDING: {
    label: "Grabación local en tu navegador",
    privacy: "La grabación permanece en tu dispositivo hasta que decidas descargarla.",
    Icon: Circle,
  },
};

export function ProcessingBadge({ executionType }: { executionType: PublicToolExecutionType }) {
  const { label, Icon } = COPY[executionType];
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Icon className="size-3.5" />
      {label}
    </Badge>
  );
}

/**
 * File-based tools (PDF/imagen) use the exact literal notice required by
 * Fase 42 spec section 9 — "Tus archivos se procesan en tu dispositivo y no
 * se suben al servidor." — instead of the generic text-content phrasing,
 * since visitors uploading a real document/photo are a distinct trust
 * moment from pasting text into a textarea.
 *
 * The Fase 43 security/dev/converter/calculator tools, and the Fase 44
 * negocios/SEO-técnico/desarrollo tools, share one mandated exact literal
 * notice instead — "Los datos se procesan en tu dispositivo y no se envían
 * al servidor." (Fase 43 spec section 25, reaffirmed by Fase 44 spec
 * section 25) — which takes priority over the file-based notice even for
 * tools in those categories that also accept an optional file (hash/JSON/
 * Base64/sitemap import), since both specs group passwords/hashes/JSON/
 * files/business data together under one "datos" notice.
 *
 * Two of the Fase 44 diseño-web tools (degradados/sombras CSS) share the
 * "diseno-web" category with Fase 42's favicon/paleta tools, which must
 * KEEP their file-specific notice (they accept real image uploads) — so
 * those two new tools are matched by slug instead of by category to avoid
 * silently changing Fase 42's established wording.
 *
 * The invoice/estimate generator gets its own distinct literal notice
 * (Fase 44 spec section 9), since it's explicitly called out on its own.
 */
const GENERIC_DATA_CATEGORIES = new Set(["seguridad", "desarrollo", "conversores", "calculadoras", "accesibilidad", "negocios", "seo-tecnico", "finanzas", "tiempo", "generadores", "educacion", "comparacion", "empleo", "organizacion", "imprimibles"]);
const GENERIC_DATA_SLUGS = new Set(["generador-degradados-css", "generador-sombras-css"]);
const INVOICE_SLUG = "generador-facturas-presupuestos";

export function PrivacyNotice({
  executionType,
  hasFiles = false,
  category,
  slug,
}: {
  executionType: PublicToolExecutionType;
  hasFiles?: boolean;
  category?: string;
  slug?: string;
}) {
  let privacy: string;
  if (slug === INVOICE_SLUG) {
    privacy = "La factura o el presupuesto se genera en tu dispositivo. Los datos no se envían al servidor.";
  } else if ((category && GENERIC_DATA_CATEGORIES.has(category)) || (slug && GENERIC_DATA_SLUGS.has(slug))) {
    privacy = "Los datos se procesan en tu dispositivo y no se envían al servidor.";
  } else if (hasFiles) {
    privacy = "Tus archivos se procesan en tu dispositivo y no se suben al servidor.";
  } else {
    privacy = COPY[executionType].privacy;
  }
  return (
    <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">{privacy}</p>
  );
}

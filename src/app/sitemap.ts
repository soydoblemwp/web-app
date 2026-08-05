import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";
import { getAllPublicTools } from "@/lib/public-tools/registry";

const STATIC_PUBLIC_PATHS = ["/", "/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/ai-disclaimer", "/herramientas"];

/**
 * Only ever lists real, public, indexable pages (spec section 30: "no
 * incluyas herramientas desactivadas o incompletas en el sitemap") — no
 * dashboard, guest, admin, or API routes, none of which are meant to be
 * indexed or are reachable without auth/session state a crawler doesn't have.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map((path) => ({
    url: `${appConfig.url}${path}`,
    lastModified: new Date(),
  }));

  const toolEntries: MetadataRoute.Sitemap = getAllPublicTools()
    .filter((tool) => tool.status === "available")
    .map((tool) => ({
      url: `${appConfig.url}/herramientas/${tool.slug}`,
      lastModified: new Date(),
    }));

  return [...staticEntries, ...toolEntries];
}

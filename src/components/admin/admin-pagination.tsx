import Link from "next/link";
import { Button } from "@/components/ui/button";

function buildHref(basePath: string, searchParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

/** Server-rendered prev/next pagination — every admin list uses this instead of loading full tables. */
export function AdminPagination({
  basePath,
  page,
  totalPages,
  searchParams,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" render={<Link href={buildHref(basePath, searchParams, page - 1)}>Anterior</Link>} />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
        )}
        {page < totalPages ? (
          <Button variant="outline" size="sm" render={<Link href={buildHref(basePath, searchParams, page + 1)}>Siguiente</Link>} />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { resetFailedSocialPostToDraftAction, setCampaignStatusAdminAction } from "@/server/actions/admin";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PAGE_SIZE, paginationSkip, parsePage, totalPages } from "@/lib/admin/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Administración · Campañas y publicaciones" };

const STATUSES: CampaignStatus[] = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const where = {
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status && STATUSES.includes(status as CampaignStatus) ? { status: status as CampaignStatus } : {}),
  };

  const [campaigns, total, scheduledPosts, failedPosts] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: paginationSkip(page),
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        owner: { select: { name: true, email: true } },
        project: { select: { name: true } },
        _count: { select: { posts: true } },
      },
    }),
    prisma.campaign.count({ where }),
    prisma.socialPost.findMany({
      where: { status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 20,
      select: { id: true, platform: true, scheduledAt: true, project: { select: { name: true } } },
    }),
    prisma.socialPost.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, platform: true, result: true, project: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campañas y publicaciones</h1>
        <p className="text-sm text-muted-foreground">{total} campañas de cuentas registradas.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre..." className="w-64" />
        <Select name="status" defaultValue={status || "ALL"}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Campaña</th>
              <th className="px-4 py-2 font-medium">Propietario</th>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Publicaciones</th>
              <th className="px-4 py-2 font-medium">Fechas</th>
              <th className="px-4 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron campañas con estos filtros.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-4 py-2 font-medium">{campaign.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{campaign.owner.name || campaign.owner.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{campaign.project.name}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{campaign._count.posts}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {campaign.startDate ? campaign.startDate.toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {campaign.status !== "ACTIVE" && campaign.status !== "ARCHIVED" ? (
                        <form action={setCampaignStatusAdminAction.bind(null, campaign.id, "ACTIVE")}>
                          <Button type="submit" size="sm" variant="outline">
                            Reactivar
                          </Button>
                        </form>
                      ) : null}
                      {campaign.status === "ACTIVE" ? (
                        <form action={setCampaignStatusAdminAction.bind(null, campaign.id, "PAUSED")}>
                          <Button type="submit" size="sm" variant="outline">
                            Pausar
                          </Button>
                        </form>
                      ) : null}
                      {campaign.status !== "ARCHIVED" ? (
                        <form action={setCampaignStatusAdminAction.bind(null, campaign.id, "ARCHIVED")}>
                          <Button type="submit" size="sm" variant="outline">
                            Archivar
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination basePath="/admin/campaigns" page={page} totalPages={totalPages(total)} searchParams={{ q, status }} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Publicaciones programadas
          </h2>
          {scheduledPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {scheduledPosts.map((post) => (
                <li key={post.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span>
                    {post.platform} · {post.project.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {post.scheduledAt ? post.scheduledAt.toLocaleString("es-ES") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Publicaciones fallidas
          </h2>
          {failedPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {failedPosts.map((post) => (
                <li key={post.id} className="space-y-1 rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {post.platform} · {post.project.name}
                    </span>
                    <form action={resetFailedSocialPostToDraftAction.bind(null, post.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Volver a borrador
                      </Button>
                    </form>
                  </div>
                  {post.result ? <p className="text-xs text-muted-foreground">{post.result}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

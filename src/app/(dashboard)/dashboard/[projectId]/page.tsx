import Link from "next/link";
import {
  FileText,
  Share2,
  Megaphone,
  CalendarClock,
  Workflow,
  Radar,
  Link2,
  Plug,
  Sparkles,
} from "lucide-react";
import { getProjectDashboardData } from "@/server/services/project-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 py-5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-semibold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getProjectDashboardData(projectId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel del proyecto</h1>
        <p className="text-sm text-muted-foreground">Resumen en tiempo real basado en los datos guardados.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Share2} label="Publicaciones pendientes" value={data.pendingPosts} href={`/dashboard/${projectId}/social`} />
        <StatCard icon={Megaphone} label="Campañas activas" value={data.activeCampaigns.length} href={`/dashboard/${projectId}/campaigns`} />
        <StatCard icon={Workflow} label="Automatizaciones activas" value={data.activeAutomations} href={`/dashboard/${projectId}/automations`} />
        <StatCard icon={Sparkles} label="Generaciones de IA (mes)" value={data.aiUsageThisMonth.generations} href={`/dashboard/${projectId}/assistant`} />
        <StatCard icon={Radar} label="Monitores con problemas" value={data.monitorsWithIssues} href={`/dashboard/${projectId}/monitoring`} />
        <StatCard icon={Link2} label="Enlaces rotos" value={data.brokenLinks} href={`/dashboard/${projectId}/links`} />
        <StatCard icon={Plug} label="Integraciones conectadas" value={data.connectedIntegrations} href={`/dashboard/${projectId}/integrations/wordpress`} />
        <StatCard icon={CalendarClock} label="Próximas publicaciones" value={data.upcomingPosts.length} href={`/dashboard/${projectId}/calendar`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Contenido reciente</CardTitle>
            <Button variant="ghost" size="sm" render={<Link href={`/dashboard/${projectId}/content`}>Ver todo</Link>} />
          </CardHeader>
          <CardContent>
            {data.recentContent.length === 0 ? (
              <EmptyRow
                icon={FileText}
                message="Todavía no has creado contenido."
                actionLabel="Generar contenido"
                href={`/dashboard/${projectId}/content/new`}
              />
            ) : (
              <ul className="divide-y">
                {data.recentContent.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/dashboard/${projectId}/content/${item.id}`} className="truncate hover:underline">
                      {item.title}
                    </Link>
                    <Badge variant="secondary">{item.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Próximas fechas del calendario</CardTitle>
            <Button variant="ghost" size="sm" render={<Link href={`/dashboard/${projectId}/calendar`}>Ver calendario</Link>} />
          </CardHeader>
          <CardContent>
            {data.upcomingPosts.length === 0 ? (
              <EmptyRow
                icon={CalendarClock}
                message="No hay publicaciones programadas."
                actionLabel="Programar publicación"
                href={`/dashboard/${projectId}/social`}
              />
            ) : (
              <ul className="divide-y">
                {data.upcomingPosts.map((post) => (
                  <li key={post.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate">{post.internalTitle || post.text.slice(0, 40)}</span>
                    <span className="text-xs text-muted-foreground">
                      {post.scheduledAt?.toLocaleDateString("es-ES")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyRow({
  icon: Icon,
  message,
  actionLabel,
  href,
}: {
  icon: React.ElementType;
  message: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" render={<Link href={href}>{actionLabel}</Link>} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, MessageCircle, CircleHelp, BookOpen, Users, Settings, ThumbsUp, ThumbsDown } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getCustomerSupportDashboardAction } from "@/server/actions/customer-support";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/components/automations/labels";
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONE, RESPONSE_TYPE_LABELS } from "@/components/customer-support/labels";

export const metadata: Metadata = { title: "Servicio al cliente" };

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className="size-5 text-muted-foreground" />
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function CustomerSupportDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");
  const stats = await getCustomerSupportDashboardAction(projectId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LifeBuoy className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Servicio al cliente</h1>
            <p className="text-sm text-muted-foreground">Agente de IA que responde preguntas frecuentes y ayuda a usar la plataforma.</p>
          </div>
        </div>
        <Badge variant={stats.agentActive ? "secondary" : "outline"}>{stats.agentActive ? "Agente activo" : "Agente desactivado"}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversaciones hoy" value={stats.conversationsToday} icon={MessageCircle} />
        <StatCard label="Conversaciones abiertas" value={stats.openConversations} icon={MessageCircle} />
        <StatCard label="Resueltas por FAQ" value={stats.resolvedByFaq} icon={CircleHelp} />
        <StatCard label="Resueltas por IA" value={stats.resolvedByAi} icon={BookOpen} />
        <StatCard label="Sin respuesta" value={stats.unanswered} icon={CircleHelp} />
        <StatCard label="Solicitudes de atencion humana" value={stats.handoffRequests} icon={Users} />
        <StatCard label="Tasa de resolucion" value={`${stats.resolutionRatePercent}%`} icon={ThumbsUp} />
        <StatCard label="Fuentes desactualizadas" value={stats.outdatedSources} icon={BookOpen} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ThumbsUp className="size-4" /> Feedback positivo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{stats.positiveFeedback}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ThumbsDown className="size-4" /> Feedback negativo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{stats.negativeFeedback}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">FAQ mas utilizadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {stats.topFaqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay FAQ publicadas.</p>
          ) : (
            stats.topFaqs.map((faq) => (
              <p key={faq.id} className="text-sm">
                {faq.question}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultimas conversaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.recentConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay conversaciones reales.</p>
          ) : (
            stats.recentConversations.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-b-0">
                <Badge variant={CONVERSATION_STATUS_TONE[c.status] ?? "outline"}>{CONVERSATION_STATUS_LABELS[c.status] ?? c.status}</Badge>
                {c.lastResponseType ? <span className="text-xs text-muted-foreground">{RESPONSE_TYPE_LABELS[c.lastResponseType] ?? c.lastResponseType}</span> : null}
                {c.escalated ? <Badge variant="destructive">Escalada</Badge> : null}
                <span className="text-xs text-muted-foreground">{c.originPage ?? ""}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(c.startedAt.toISOString())}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/${projectId}/customer-support/settings`} className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
          <Settings className="size-4" /> Probar agente / activar
        </Link>
        <Link href={`/dashboard/${projectId}/customer-support/faqs`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Administrar FAQ
        </Link>
        <Link href={`/dashboard/${projectId}/customer-support/knowledge`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Administrar conocimiento
        </Link>
        <Link href={`/dashboard/${projectId}/customer-support/conversations`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Ver conversaciones
        </Link>
        <Link href={`/dashboard/${projectId}/customer-support/handoffs`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Solicitudes humanas
        </Link>
      </div>
    </div>
  );
}

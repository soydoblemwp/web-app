import Link from "next/link";
import type { Metadata } from "next";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { projectId } = await params;
  const { month } = await searchParams;

  const reference = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const monthStart = startOfMonth(reference);
  const monthEnd = endOfMonth(reference);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const posts = await prisma.socialPost.findMany({
    where: { projectId, scheduledAt: { gte: gridStart, lte: gridEnd } },
    orderBy: { scheduledAt: "asc" },
  });

  const postsByDay = new Map<string, typeof posts>();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const key = format(post.scheduledAt, "yyyy-MM-dd");
    postsByDay.set(key, [...(postsByDay.get(key) ?? []), post]);
  }

  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");

  const unscheduled = await prisma.socialPost.findMany({
    where: { projectId, scheduledAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario editorial</h1>
          <p className="text-sm text-muted-foreground">{format(monthStart, "MMMM yyyy", { locale: es })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            render={
              <Link href={`?month=${prevMonth}`}>
                <ChevronLeft className="size-4" />
              </Link>
            }
          />
          <Button
            variant="outline"
            size="icon"
            render={
              <Link href={`?month=${nextMonth}`}>
                <ChevronRight className="size-4" />
              </Link>
            }
          />
          <Button
            render={
              <Link href={`/dashboard/${projectId}/social/new`}>
                <Plus className="mr-1 size-4" /> Nueva publicación
              </Link>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="bg-muted/50 px-2 py-1 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayPosts = postsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={cn("min-h-24 space-y-1 bg-background p-1.5", {
                "opacity-40": !isSameMonth(day, monthStart),
              })}
            >
              <span
                className={cn("inline-flex size-5 items-center justify-center rounded-full text-[11px]", {
                  "bg-primary text-primary-foreground": isToday(day),
                })}
              >
                {format(day, "d")}
              </span>
              <div className="space-y-1">
                {dayPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/dashboard/${projectId}/social/${post.id}`}
                    className="block truncate rounded bg-muted px-1.5 py-0.5 text-[11px] hover:bg-muted/70"
                  >
                    {post.platform}: {post.internalTitle || post.text.slice(0, 20)}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Publicaciones sin fecha ({unscheduled.length})</h2>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((post) => (
              <Link key={post.id} href={`/dashboard/${projectId}/social/${post.id}`}>
                <Badge variant="outline">{post.platform}: {post.internalTitle || post.text.slice(0, 24)}</Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Para mover una publicación a otra fecha, ábrela y edita su fecha programada desde el formulario de la
        publicación (el arrastrar y soltar no está disponible en esta versión).
      </p>
    </div>
  );
}

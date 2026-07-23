import { NextResponse } from "next/server";
import { requireUser } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const user = await requireUser();

  const [profile, projects, contentItems] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true, timezone: true, locale: true },
    }),
    prisma.project.findMany({ where: { members: { some: { userId: user.id } } } }),
    prisma.contentItem.findMany({ where: { authorId: user.id, deletedAt: null } }),
  ]);

  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), profile, projects, contentItems }, null, 2);

  return new NextResponse(payload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=\"mis-datos.json\"",
    },
  });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/notifications - Fetch user's notifications
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications - Mark notifications as read
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ids } = body as { ids?: string[] };

  if (ids && ids.length > 0) {
    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
      data: { isRead: true },
    });
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ success: true });
}

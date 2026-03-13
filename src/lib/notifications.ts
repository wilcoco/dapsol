import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/notifications/sse-emitter";

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  qaSetId?: string;
  investmentId?: string;
}) {
  const notification = await prisma.notification.create({ data: params });

  // Push via SSE to connected clients
  pushNotification(params.userId, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    createdAt: notification.createdAt.toISOString(),
  });

  return notification;
}

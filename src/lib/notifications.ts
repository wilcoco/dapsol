import { prisma } from "@/lib/prisma";

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  qaSetId?: string;
  investmentId?: string;
}) {
  return prisma.notification.create({ data: params });
}

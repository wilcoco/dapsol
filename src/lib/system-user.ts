import { prisma } from "@/lib/prisma";

const SYSTEM_AI_EMAIL = "system-ai@collective-intelligence.local";

/**
 * Get or create the system AI user account.
 * Used as creatorId for AI-generated QASets.
 */
export async function getSystemAIUser(): Promise<{ id: string; name: string | null }> {
  return prisma.user.upsert({
    where: { email: SYSTEM_AI_EMAIL },
    update: {},
    create: {
      name: "AI 시스템",
      email: SYSTEM_AI_EMAIL,
      isSystemAI: true,
      balance: 0,
      trustLevel: 5,
      hubScore: 1.0,
      authorityScore: 100,
    },
    select: { id: true, name: true },
  });
}

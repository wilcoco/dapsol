/**
 * Dapsol 발자국 보상 지급 모듈
 */

import { prisma } from "@/lib/prisma";
import { FOOTPRINT_REWARDS } from "./reward-calculator";

export type FootprintRewardType = "SIGNUP" | "AI_ANSWER" | "PIONEER" | "GAP_FILL";

/**
 * 사용자에게 발자국 보상 지급
 */
export async function grantFootprintReward(
  userId: string,
  type: FootprintRewardType,
  qaSetId?: string
): Promise<{ success: boolean; amount: number; newBalance: number }> {
  const amount = FOOTPRINT_REWARDS[type];

  if (!amount || amount <= 0) {
    return { success: false, amount: 0, newBalance: 0 };
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
      select: { balance: true },
    });

    return {
      success: true,
      amount,
      newBalance: user.balance,
    };
  } catch (error) {
    console.error(`[FootprintReward] Failed to grant ${type} to ${userId}:`, error);
    return { success: false, amount: 0, newBalance: 0 };
  }
}

/**
 * 가입 보상 지급 (User 생성 시 기본값으로 처리되므로 별도 호출 불필요)
 */
export async function grantSignupReward(userId: string) {
  return grantFootprintReward(userId, "SIGNUP");
}

/**
 * AI 답변 생성 보상 지급
 */
export async function grantAIAnswerReward(userId: string, qaSetId: string) {
  return grantFootprintReward(userId, "AI_ANSWER", qaSetId);
}

/**
 * 개척자 보상 지급 (새 길 생성)
 */
export async function grantPioneerReward(userId: string, qaSetId: string) {
  return grantFootprintReward(userId, "PIONEER", qaSetId);
}

/**
 * AI 빈틈 채우기 보상 지급 (사냥 성공)
 */
export async function grantGapFillReward(userId: string, qaSetId: string) {
  return grantFootprintReward(userId, "GAP_FILL", qaSetId);
}

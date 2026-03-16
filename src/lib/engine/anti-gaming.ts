/**
 * Anti-Gaming Rules for Investment System
 *
 * 악의적 투자 패턴 방지:
 *   1. 자기 투자 방지 — 제작자는 본인 Q&A에 추가 투자 불가
 *   2. 시간당 투자 건수 제한 — 3건/시간
 *   3. 일일 투자 건수 제한 — 10건/일
 *   4. 동일 Q&A 재투자 쿨다운 — 24시간
 *   5. 신규 계정 워밍업 — 가입 7일 이내 최대 투자액 50
 *   6. 상호 투자 차단 — A→B, B→A 동시 투자 24시간 내 차단
 */

import { PrismaClient } from "@prisma/client";

// ─── 상수 ───
export const MAX_INVESTMENTS_PER_HOUR = 3;
export const MAX_INVESTMENTS_PER_DAY  = 10;
export const REINVESTMENT_COOLDOWN_HOURS = 24;
export const WARMUP_DAYS = 7;
export const WARMUP_MAX_INVESTMENT = 50;

export interface AntiGamingViolation {
  code: string;
  message: string;
  statusCode: number;
}

/**
 * 투자 전 모든 anti-gaming 규칙을 검사.
 * 위반 시 AntiGamingViolation 반환, 정상이면 null.
 */
export async function checkInvestmentRules(
  prisma: PrismaClient,
  userId: string,
  qaSetId: string,
  qaSetCreatorId: string,
  amount: number,
  userCreatedAt: Date,
  isNegative: boolean = false
): Promise<AntiGamingViolation | null> {
  // 1. 자기 투자 방지 (마이너스 투자는 별도 처리됨 — API 라우트에서)
  if (!isNegative && userId === qaSetCreatorId) {
    return {
      code: "SELF_INVESTMENT",
      message: "본인이 만든 Q&A에는 추가 투자할 수 없습니다. (공유 시 첫 투자만 허용)",
      statusCode: 403,
    };
  }

  const now = new Date();

  // 2. 신규 계정 워밍업: 가입 7일 이내 최대 50
  const accountAgeDays = (now.getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < WARMUP_DAYS && amount > WARMUP_MAX_INVESTMENT) {
    return {
      code: "WARMUP_LIMIT",
      message: `가입 ${WARMUP_DAYS}일 이내에는 1회 최대 ${WARMUP_MAX_INVESTMENT} 💰만 투자할 수 있습니다. (현재 계정 나이: ${Math.floor(accountAgeDays)}일)`,
      statusCode: 400,
    };
  }

  // 3. 동일 Q&A 재투자 쿨다운 (같은 방향의 투자만 체크)
  const cooldownFrom = new Date(now.getTime() - REINVESTMENT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recentSameQA = await prisma.investment.count({
    where: {
      userId,
      qaSetId,
      isNegative,
      createdAt: { gte: cooldownFrom },
    },
  });
  if (recentSameQA > 0) {
    return {
      code: "REINVESTMENT_COOLDOWN",
      message: `동일 Q&A에 ${isNegative ? "재반대 투자" : "재투자"}하려면 ${REINVESTMENT_COOLDOWN_HOURS}시간을 기다려야 합니다.`,
      statusCode: 429,
    };
  }

  // 4. 시간당 투자 건수 제한 (플러스+마이너스 합산)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const investmentsLastHour = await prisma.investment.count({
    where: {
      userId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (investmentsLastHour >= MAX_INVESTMENTS_PER_HOUR) {
    return {
      code: "RATE_LIMIT_HOUR",
      message: `시간당 최대 ${MAX_INVESTMENTS_PER_HOUR}건만 활동할 수 있습니다. 잠시 후 다시 시도해주세요.`,
      statusCode: 429,
    };
  }

  // 5. 일일 투자 건수 제한 (합산)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const investmentsLastDay = await prisma.investment.count({
    where: {
      userId,
      createdAt: { gte: oneDayAgo },
    },
  });
  if (investmentsLastDay >= MAX_INVESTMENTS_PER_DAY) {
    return {
      code: "RATE_LIMIT_DAY",
      message: `하루 최대 ${MAX_INVESTMENTS_PER_DAY}건만 활동할 수 있습니다. 내일 다시 시도해주세요.`,
      statusCode: 429,
    };
  }

  return null; // 모든 검사 통과
}

/**
 * 상호 투자 차단 (A→B & B→A in 24h).
 * 위반 시 AntiGamingViolation 반환, 정상이면 null.
 */
export async function detectMutualInvestment(
  prisma: PrismaClient,
  investorId: string,
  qaSetId: string
): Promise<AntiGamingViolation | null> {
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { creatorId: true },
  });
  if (!qaSet) return null;

  const creatorId = qaSet.creatorId;
  if (investorId === creatorId) return null; // self-invest is handled elsewhere

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check if creator has invested in any of investor's QASets in last 24h
  const mutualInvestment = await prisma.investment.findFirst({
    where: {
      userId: creatorId,
      qaSet: { creatorId: investorId },
      createdAt: { gte: oneDayAgo },
    },
  });

  if (mutualInvestment) {
    console.warn(`[AntiGaming] 상호 투자 차단: ${investorId} ↔ ${creatorId} (Q&A: ${qaSetId})`);
    return {
      code: "MUTUAL_INVESTMENT",
      message: "상호 투자가 감지되었습니다. 24시간 내 서로의 Q&A에 투자할 수 없습니다.",
      statusCode: 403,
    };
  }
  return null;
}

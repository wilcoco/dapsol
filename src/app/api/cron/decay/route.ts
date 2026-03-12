/**
 * GET /api/cron/decay
 *
 * Vercel Cron 전용 엔드포인트 (매주 월요일 03:00 UTC 실행).
 * Authorization: Bearer ${CRON_SECRET} 헤더로 보호.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyDecay } from "@/lib/engine/decay";

export async function GET(req: NextRequest) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동 첨부
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await applyDecay(prisma);
    console.log(`[Cron/Decay] ${new Date().toISOString()} — ${JSON.stringify(result)}`);

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron/Decay] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

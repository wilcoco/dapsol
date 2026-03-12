/**
 * 기존 공유 QASet에 대해 벡터 임베딩을 일괄 생성하는 백필 스크립트
 *
 * 실행: npx tsx scripts/backfill-embeddings.ts
 */

import * as fs from "fs";
import * as path from "path";

// .env.local 수동 로드 (dotenv 없이)
const envLocalPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log("📂 .env.local 로드 완료");
}

import { PrismaClient } from "@prisma/client";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

const prisma = new PrismaClient();
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TEXT_LENGTH = 1000;
const DELAY_MS = 500; // Rate limiting: 0.5초 간격

function assembleText(
  title: string | null,
  messages: { role: string; content: string }[]
): string {
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const firstAssistant = messages.find((m) => m.role === "assistant")?.content ?? "";
  const parts = [
    title ? `제목: ${title}` : "",
    firstUser ? `질문: ${firstUser.slice(0, 400)}` : "",
    firstAssistant ? `답변: ${firstAssistant.slice(0, 500)}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, MAX_TEXT_LENGTH);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  // 임베딩이 없는 공유 QASet 조회
  const qaSets = await prisma.qASet.findMany({
    where: {
      isShared: true,
      embedding: null,
    },
    include: {
      messages: {
        orderBy: { orderIndex: "asc" },
        take: 6,
        select: { role: true, content: true },
      },
    },
  });

  console.log(`📊 임베딩 생성 대상: ${qaSets.length}개 QASet`);

  let success = 0;
  let failed = 0;

  for (const qa of qaSets) {
    try {
      const text = assembleText(qa.title, qa.messages);

      if (text.length < 10) {
        console.log(`⏭️  [${qa.id}] 텍스트 너무 짧음, 건너뜀`);
        continue;
      }

      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: text,
      });

      await prisma.qASet.update({
        where: { id: qa.id },
        data: {
          embedding: JSON.stringify(embedding),
          embeddingModel: EMBEDDING_MODEL,
        },
      });

      success++;
      console.log(
        `✅ [${success}/${qaSets.length}] ${qa.id} — "${(qa.title ?? "").slice(0, 40)}..."`
      );

      await sleep(DELAY_MS);
    } catch (error) {
      failed++;
      console.error(`❌ [${qa.id}] 실패:`, error);
    }
  }

  console.log(`\n🏁 완료: 성공 ${success}, 실패 ${failed}, 전체 ${qaSets.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 크레딧 경제 시뮬레이션
 *
 * 가입자 증가에 따른 잠김(지분) vs 유동(잔액) 크레딧 비율 분석
 * 소각 없는 버전 (50:50, 55:45, 60:40 비교)
 */

const INITIAL_BALANCE = 1000;
const REWARD_CAP_MULTIPLIER = 2;

// 마일스톤 해제
const MILESTONE_RELEASE = { 3: 0.20, 10: 0.30, 25: 0.50 };
const POOL_CREATOR_SHARE = 0.60;
const POOL_INVESTOR_SHARE = 0.40;

function simulate({
  totalUsers,
  poolRatio,
  rewardRatio,
  avgInvestPerUser,    // 유저당 평균 투자 횟수
  avgInvestAmount,     // 1회 평균 투자액
  qaSetCount,          // 생성되는 Q&A 수
  label
}) {
  // State
  const users = []; // { id, balance, totalInvested, totalReward }
  const qaSets = []; // { id, creatorId, qualityPool, investors: [{userId, amount, reward}], investorCount }

  let totalLocked = 0;    // 품질풀에 잠긴 총액
  let totalCirculating = 0; // 유저 잔액 총합
  let totalIssued = 0;     // 발행된 총 크레딧

  const snapshots = [];

  // 유저 등록
  for (let i = 0; i < totalUsers; i++) {
    users.push({
      id: i,
      balance: INITIAL_BALANCE,
      totalInvested: 0,
      totalReward: 0
    });
    totalIssued += INITIAL_BALANCE;
    totalCirculating += INITIAL_BALANCE;
  }

  // Q&A 생성 (앞쪽 유저들이 생성)
  for (let i = 0; i < qaSetCount; i++) {
    qaSets.push({
      id: i,
      creatorId: i % totalUsers,
      qualityPool: 0,
      investors: [],
      investorCount: 0,
    });
  }

  // 투자 시뮬레이션
  let investmentRound = 0;
  for (let u = 0; u < totalUsers; u++) {
    const user = users[u];
    const investCount = Math.min(avgInvestPerUser, Math.floor(user.balance / avgInvestAmount));

    for (let j = 0; j < investCount; j++) {
      // 랜덤 Q&A 선택 (자기 것 제외)
      const candidates = qaSets.filter(q => q.creatorId !== u);
      if (candidates.length === 0) continue;
      const qa = candidates[Math.floor(Math.random() * candidates.length)];

      // 이미 투자한 Q&A는 스킵
      if (qa.investors.some(inv => inv.userId === u)) continue;

      const amount = Math.min(avgInvestAmount, user.balance);
      if (amount <= 0) continue;

      // 투자금 분할
      const rewardPool = Math.floor(amount * rewardRatio);
      let qualityPoolAdd = amount - rewardPool;

      // 잔액 차감
      user.balance -= amount;
      user.totalInvested += amount;
      totalCirculating -= amount;

      // 선투자자 보상 분배
      let totalDistributed = 0;
      if (qa.investors.length > 0) {
        const totalWeight = qa.investors.reduce((s, inv) => s + Math.sqrt(inv.amount), 0);
        for (const inv of qa.investors) {
          const ratio = Math.sqrt(inv.amount) / totalWeight;
          let reward = Math.floor(rewardPool * ratio);
          // 상한 체크
          const cap = inv.amount * REWARD_CAP_MULTIPLIER - inv.reward;
          if (reward > cap) reward = Math.max(0, cap);
          if (reward > 0) {
            users[inv.userId].balance += reward;
            users[inv.userId].totalReward += reward;
            inv.reward += reward;
            totalDistributed += reward;
            totalCirculating += reward;
          }
        }
      }
      // 미분배분은 풀로
      const undistributed = rewardPool - totalDistributed;
      qualityPoolAdd += undistributed;

      // 품질풀 추가
      qa.qualityPool += qualityPoolAdd;
      totalLocked += qualityPoolAdd;

      // 투자자 등록
      qa.investors.push({ userId: u, amount, reward: 0 });
      qa.investorCount++;

      // 마일스톤 체크
      const releaseRatio = MILESTONE_RELEASE[qa.investorCount];
      if (releaseRatio && qa.qualityPool > 0) {
        const released = Math.floor(qa.qualityPool * releaseRatio);
        qa.qualityPool -= released;
        totalLocked -= released;

        const creatorReward = Math.floor(released * POOL_CREATOR_SHARE);
        const investorPool = released - creatorReward;

        // 창작자 보상
        users[qa.creatorId].balance += creatorReward;
        users[qa.creatorId].totalReward += creatorReward;
        totalCirculating += creatorReward;

        // 투자자 보상
        if (qa.investors.length > 0 && investorPool > 0) {
          const perInvestor = Math.floor(investorPool / qa.investors.length);
          for (const inv of qa.investors) {
            if (perInvestor > 0) {
              users[inv.userId].balance += perInvestor;
              users[inv.userId].totalReward += perInvestor;
              totalCirculating += perInvestor;
            }
          }
        }
      }

      investmentRound++;
    }

    // 스냅샷 (50명마다)
    if ((u + 1) % Math.max(1, Math.floor(totalUsers / 10)) === 0 || u === totalUsers - 1) {
      const actualCirculating = users.reduce((s, usr) => s + usr.balance, 0);
      const actualLocked = qaSets.reduce((s, q) => s + q.qualityPool, 0);
      snapshots.push({
        users: u + 1,
        issued: totalIssued,
        circulating: actualCirculating,
        locked: actualLocked,
        lockedRatio: ((actualLocked / totalIssued) * 100).toFixed(1),
        circulatingRatio: ((actualCirculating / totalIssued) * 100).toFixed(1),
        avgBalance: Math.round(actualCirculating / (u + 1)),
        investments: investmentRound,
      });
    }
  }

  return { label, snapshots };
}

// ── 시나리오 실행 ──
console.log("═══════════════════════════════════════════════════════════");
console.log("  크레딧 경제 시뮬레이션 (소각 없음)");
console.log("  초기 잔액: 1000💎/인");
console.log("═══════════════════════════════════════════════════════════\n");

const scenarios = [
  // 시나리오 1: 소규모 (50명)
  { totalUsers: 50, poolRatio: 0.50, rewardRatio: 0.50, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 15, label: "50명 · 50:50 · Q&A 15개" },
  { totalUsers: 50, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 15, label: "50명 · 55:45 · Q&A 15개" },
  { totalUsers: 50, poolRatio: 0.60, rewardRatio: 0.40, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 15, label: "50명 · 60:40 · Q&A 15개" },

  // 시나리오 2: 중규모 (500명)
  { totalUsers: 500, poolRatio: 0.50, rewardRatio: 0.50, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 100, label: "500명 · 50:50 · Q&A 100개" },
  { totalUsers: 500, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 100, label: "500명 · 55:45 · Q&A 100개" },
  { totalUsers: 500, poolRatio: 0.60, rewardRatio: 0.40, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 100, label: "500명 · 60:40 · Q&A 100개" },

  // 시나리오 3: 대규모 (5000명)
  { totalUsers: 5000, poolRatio: 0.50, rewardRatio: 0.50, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 800, label: "5000명 · 50:50 · Q&A 800개" },
  { totalUsers: 5000, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 800, label: "5000명 · 55:45 · Q&A 800개" },
  { totalUsers: 5000, poolRatio: 0.60, rewardRatio: 0.40, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 800, label: "5000명 · 60:40 · Q&A 800개" },

  // 시나리오 4: 급성장 (5000명, 적은 Q&A → 쏠림 현상)
  { totalUsers: 5000, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 5, avgInvestAmount: 80, qaSetCount: 50, label: "5000명 · 55:45 · Q&A 50개 (쏠림)" },

  // 시나리오 5: 고액 투자자 (평균 투자 높음)
  { totalUsers: 500, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 3, avgInvestAmount: 200, qaSetCount: 100, label: "500명 · 55:45 · 고액투자(200💎)" },

  // 시나리오 6: 소액 다건 투자
  { totalUsers: 500, poolRatio: 0.55, rewardRatio: 0.45, avgInvestPerUser: 10, avgInvestAmount: 30, qaSetCount: 100, label: "500명 · 55:45 · 소액다건(30💎×10)" },
];

for (const scenario of scenarios) {
  const result = simulate(scenario);
  console.log(`\n── ${result.label} ──`);
  console.log("유저수  | 발행총액  | 유동(잔액)  | 잠김(풀)  | 유동%  | 잠김%  | 인당잔액 | 투자건수");
  console.log("--------|----------|-----------|----------|-------|-------|---------|-------");
  for (const s of result.snapshots) {
    console.log(
      `${String(s.users).padStart(6)} | ` +
      `${String(s.issued).padStart(8)} | ` +
      `${String(s.circulating).padStart(9)} | ` +
      `${String(s.locked).padStart(8)} | ` +
      `${s.circulatingRatio.padStart(5)}% | ` +
      `${s.lockedRatio.padStart(5)}% | ` +
      `${String(s.avgBalance).padStart(7)} | ` +
      `${String(s.investments).padStart(6)}`
    );
  }
}

// ── 핵심 비교 요약 ──
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("  핵심 비교: 최종 상태 요약");
console.log("═══════════════════════════════════════════════════════════\n");
console.log("시나리오                              | 유동%  | 잠김%  | 인당잔액");
console.log("--------------------------------------|-------|-------|--------");

for (const scenario of scenarios) {
  const result = simulate(scenario);
  const last = result.snapshots[result.snapshots.length - 1];
  console.log(
    `${result.label.padEnd(38)}| ${last.circulatingRatio.padStart(5)}% | ${last.lockedRatio.padStart(5)}% | ${String(last.avgBalance).padStart(7)}`
  );
}

console.log("\n참고: 유동% + 잠김% < 100%인 경우는 보상 상한(2x) 초과로 미분배분이 풀에 흡수된 후 마일스톤 해제된 것");
console.log("      유동% + 잠김% > 100%는 불가 (닫힌 시스템)");

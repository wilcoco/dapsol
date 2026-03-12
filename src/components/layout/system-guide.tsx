"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { HubIcon, AuthorityIcon } from "@/components/ui/score-icons";

const GUIDE_SECTIONS = [
  {
    id: "overview",
    icon: "🧠",
    title: "전체 개요",
    content: [
      {
        subtitle: "업무 지식이란?",
        text: "질문과 답변을 통해 업무 지식을 축적하고 공유하는 플랫폼입니다. 좋은 Q&A 콘텐츠를 만들거나, 가치 있는 콘텐츠를 발굴하여 투자하면 보상을 받습니다.",
      },
      {
        subtitle: "핵심 활동",
        text: "1) Q&A 만들기 — AI와 대화하며 지식을 정리합니다.\n2) 공유하기 — 완성된 Q&A를 커뮤니티에 공유합니다.\n3) 투자하기 — 가치 있다고 판단한 Q&A에 포인트를 투자합니다.\n4) 보상 받기 — 내가 투자한 Q&A에 후속 투자가 들어오면 보상을 받습니다.",
      },
    ],
  },
  {
    id: "invest",
    icon: "💎",
    title: "투자 시스템",
    content: [
      {
        subtitle: "투자하면 무슨 일이 일어나나요?",
        text: "투자금은 두 부분으로 나뉩니다:\n• 품질 풀 (50%) — 에스크로에 잠깁니다. 투자자가 마일스톤(3, 10, 25명)에 도달하면 해제되어 전체 지분 보유자(창작자 포함)에게 비례 배분됩니다.\n• 선투자자 보상 (50%) — 나보다 먼저 투자한 사람들에게 지분 비례로 돌아갑니다.",
      },
      {
        subtitle: "왜 일찍 투자하면 유리한가요?",
        text: "먼저 투자하면 이후 들어오는 모든 투자에서 50%를 보상으로 나눠 받습니다. 인기 있는 Q&A에 일찍 투자할수록 더 많은 후속 투자자로부터 보상을 받을 수 있습니다.",
      },
      {
        subtitle: "품질 풀은 왜 있나요?",
        text: "품질 풀은 콘텐츠의 진짜 가치를 검증하는 장치입니다. 여러 사람이 독립적으로 투자할 만큼 가치 있는 콘텐츠만 풀이 해제되어 보상이 발생합니다. 소수끼리 서로 밀어주는 것으로는 마일스톤에 도달하기 어렵습니다.",
      },
      {
        subtitle: "보상 상한",
        text: "한 투자에서 받을 수 있는 누적 보상은 원금의 2배까지입니다. 예를 들어 100 💎을 투자하면 최대 200 💎까지 보상받을 수 있습니다.",
      },
    ],
  },
  {
    id: "scores",
    icon: "📊",
    title: "Hub & Authority 점수",
    content: [
      {
        subtitle: "🎯 Hub 점수 (투자 안목)",
        text: "투자해서 받은 보상 실적을 기반으로 계산됩니다. 좋은 Q&A를 먼저 발굴해서 높은 보상을 받을수록 Hub가 올라갑니다.\n\n• Hub가 높으면: 같은 금액으로 더 큰 실효 지분을 확보합니다.\n• 실효 가중치 = √(투자금) × Hub 점수\n• 기본값: 1.0 (신규 사용자)",
      },
      {
        subtitle: "⚡ Authority 점수 (창작 권위)",
        text: "내가 만든 Q&A에 다른 사람들이 투자한 실적을 기반으로 계산됩니다. 외부 투자가 쌓일수록 Authority가 올라갑니다.\n\n• Authority가 높으면: 품질 풀 해제 시 더 많은 보상, 포크 Q&A에서 높은 배분 비율을 확보합니다.\n• 기본값: 100 (Q&A를 공유한 모든 사용자)\n• 자기 투자는 제외됩니다 — 순수하게 다른 사람의 투자만 반영합니다.",
      },
      {
        subtitle: "📐 로그 스케일이란?",
        text: "점수는 로그 함수로 계산되어 높아질수록 올리기 지수적으로 어려워집니다.\n\n예시 (Authority):\n• 외부투자 평균 100 → 점수 150\n• 외부투자 평균 1,000 → 점수 267\n• 외부투자 평균 10,000 → 점수 433\n\n같은 50점을 올리는 데 필요한 투자가 점점 많아집니다. 이는 점수 조작을 비효율적으로 만들고, 꾸준한 양질의 활동만이 높은 점수를 유지할 수 있게 합니다.",
      },
    ],
  },
  {
    id: "trust",
    icon: "🎖️",
    title: "신뢰 레벨",
    content: [
      {
        subtitle: "신뢰 레벨이란?",
        text: "활동 점수(투자액 + 받은 보상)가 쌓이면 레벨이 올라갑니다. 레벨이 높을수록 1회 최대 투자 한도가 증가합니다.",
      },
      {
        subtitle: "레벨별 한도",
        text: "• Lv.1 신규 — 최대 50 💎 / 회 (활동 점수 0+)\n• Lv.2 기여자 — 최대 100 💎 / 회 (활동 점수 150+)\n• Lv.3 전문가 — 최대 200 💎 / 회 (활동 점수 500+)\n• Lv.4 마스터 — 최대 350 💎 / 회 (활동 점수 1,500+)\n• Lv.5 권위자 — 최대 500 💎 / 회 (활동 점수 5,000+)",
      },
    ],
  },
  {
    id: "rules",
    icon: "🛡️",
    title: "건전성 규칙",
    content: [
      {
        subtitle: "투자 제한",
        text: "• 자기 Q&A에 투자 불가 (창작 시 Authority로 자동 반영)\n• 시간당 최대 3건 투자\n• 하루 최대 10건 투자\n• 같은 Q&A에 재투자는 24시간 후 가능\n• 신규 계정(7일 미만)은 1회 최대 50 💎",
      },
      {
        subtitle: "점수 조작 방지",
        text: "• 로그 스케일로 높은 점수를 인위적으로 올리기 어려움\n• 자기 투자는 Authority에 반영되지 않음\n• 상호 투자 패턴 감지 시 경고\n• 품질 풀 마일스톤으로 다수의 독립적 투자가 필요",
      },
      {
        subtitle: "투자 철회",
        text: "투자 후 24시간 이내에 철회할 수 있습니다. 다만, 투자금의 20%가 수수료로 차감됩니다.",
      },
    ],
  },
  {
    id: "negative",
    icon: "🔻",
    title: "마이너스 투자 (사냥)",
    content: [
      {
        subtitle: "마이너스 투자란?",
        text: "낮은 품질이나 파밍이 의심되는 콘텐츠에 '마이너스 투자'를 할 수 있습니다. 마이너스 투자를 받은 Q&A는 순투자액이 감소하고, 제작자의 Authority가 떨어집니다.",
      },
      {
        subtitle: "사냥꾼 보상 구조",
        text: "플러스 투자와 동일한 대칭 구조입니다!\n• 50% → 사냥 풀 (마일스톤에서 해제, 지분 비례 배분)\n• 50% → 선행 사냥꾼 보상\n\n먼저 나쁜 콘텐츠를 발견한 사냥꾼이 유리합니다.",
      },
      {
        subtitle: "조건과 주의사항",
        text: "• 신뢰 레벨 Lv.2 이상만 가능\n• 이미 플러스 투자한 Q&A에는 불가 (반대도 마찬가지)\n• 자기 Q&A에 마이너스 투자 불가\n• 마이너스 투자도 토큰 비용이 들므로 확신이 있을 때만!\n• 순투자가 0 이하가 되면 콘텐츠에 품질 경고 표시",
      },
    ],
  },
  {
    id: "fork",
    icon: "🔗",
    title: "포크 (확장) Q&A",
    content: [
      {
        subtitle: "포크란?",
        text: "다른 사람의 공유된 Q&A를 기반으로 새로운 질문을 이어나가는 기능입니다. 원본의 맥락을 유지하면서 더 깊은 탐구가 가능합니다.",
      },
      {
        subtitle: "포크 Q&A의 투자금 배분",
        text: "포크 Q&A에 투자가 들어오면, 투자금 일부가 원본 Q&A 투자자들에게도 배분됩니다. 배분 비율은 두 창작자의 Authority 비율로 결정됩니다.\n\n예시: 원본 Authority 200, 포크 Authority 100 → 원본에 67% 배분",
      },
    ],
  },
];

export function SystemGuide() {
  const [openSection, setOpenSection] = useState("overview");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" title="시스템 가이드">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">도움말</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg">📖 시스템 가이드</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 overflow-hidden flex-1 min-h-0">
          {/* Section tabs */}
          <div className="w-36 shrink-0 space-y-1 overflow-y-auto">
            {GUIDE_SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setOpenSection(section.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  openSection === section.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="mr-1.5">{section.icon}</span>
                {section.title}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto pr-1">
            {GUIDE_SECTIONS.filter((s) => s.id === openSection).map((section) => (
              <div key={section.id} className="space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>{section.icon}</span>
                  {section.title}
                </h2>
                {section.content.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{item.subtitle}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

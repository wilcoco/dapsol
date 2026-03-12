import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * Hub 아이콘: 중앙 원에서 바깥으로 화살표가 나가는 형태
 * → 좋은 Q&A를 발굴하러 나가는 투자 안목
 */
export function HubIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("inline-block", className)}
    >
      {/* 중앙 원 */}
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.9" />
      {/* 위 화살표 */}
      <path d="M12 6V1M12 1L9.5 3.5M12 1L14.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 오른쪽 화살표 */}
      <path d="M18 12H23M23 12L20.5 9.5M23 12L20.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 아래 화살표 */}
      <path d="M12 18V23M12 23L9.5 20.5M12 23L14.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 왼쪽 화살표 */}
      <path d="M6 12H1M1 12L3.5 9.5M1 12L3.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Authority 아이콘: 바깥에서 중앙 원으로 화살표가 들어오는 형태
 * → 다른 사람들의 투자를 받아들이는 창작 권위
 */
export function AuthorityIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("inline-block", className)}
    >
      {/* 중앙 원 */}
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.9" />
      {/* 위에서 들어오는 화살표 */}
      <path d="M12 1V6M12 6L9.5 3.5M12 6L14.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 오른쪽에서 들어오는 화살표 */}
      <path d="M23 12H18M18 12L20.5 9.5M18 12L20.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 아래에서 들어오는 화살표 */}
      <path d="M12 23V18M12 18L9.5 20.5M12 18L14.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 왼쪽에서 들어오는 화살표 */}
      <path d="M1 12H6M6 12L3.5 9.5M6 12L3.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

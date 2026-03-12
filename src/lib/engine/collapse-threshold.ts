/**
 * Collapse Threshold
 * Determines when a Q&A should be considered "collapsed" (low quality).
 * Requires minimum 3 hunters AND >60% negative ratio.
 */

export interface CollapseCheckResult {
  isCollapsed: boolean;
  negativeCount: number;
  totalCount: number;
  negativeRatio: number;
  reason?: string;
}

const MIN_HUNTERS = 3;
const COLLAPSE_RATIO = 0.6;

export function checkCollapseThreshold(
  investorCount: number,
  negativeCount: number,
  totalInvested: number,
  negativeInvested: number
): CollapseCheckResult {
  const totalCount = investorCount + negativeCount;
  const negativeRatio = totalCount > 0 ? negativeCount / totalCount : 0;

  if (negativeCount >= MIN_HUNTERS && negativeRatio > COLLAPSE_RATIO) {
    return {
      isCollapsed: true,
      negativeCount,
      totalCount,
      negativeRatio,
      reason: `${negativeCount}명의 사냥꾼이 오류를 지적 (비율: ${Math.round(negativeRatio * 100)}%)`,
    };
  }

  return {
    isCollapsed: false,
    negativeCount,
    totalCount,
    negativeRatio,
  };
}

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

  // Amount-weighted ratio: prevents 3 users with 1 point each from collapsing a 10,000-point Q&A
  const totalAmount = totalInvested + negativeInvested;
  const negativeAmountRatio = totalAmount > 0 ? negativeInvested / totalAmount : 0;

  if (
    negativeCount >= MIN_HUNTERS &&
    negativeRatio > COLLAPSE_RATIO &&
    negativeAmountRatio > COLLAPSE_RATIO
  ) {
    return {
      isCollapsed: true,
      negativeCount,
      totalCount,
      negativeRatio,
      reason: `${negativeCount}명의 반대 투자자가 오류를 지적 (인원 비율: ${Math.round(negativeRatio * 100)}%, 금액 비율: ${Math.round(negativeAmountRatio * 100)}%)`,
    };
  }

  return {
    isCollapsed: false,
    negativeCount,
    totalCount,
    negativeRatio,
  };
}

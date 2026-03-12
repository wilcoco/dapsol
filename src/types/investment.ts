export interface InvestmentData {
  id: string;
  qaSetId: string;
  userId: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    trustLevel: number;
  };
  amount: number;
  position: number;
  isActive: boolean;
  createdAt: Date;
}

export interface InvestmentSummary {
  totalInvested: number;
  investorCount: number;
  myInvestment: number | null;
  myShare: number | null; // percentage
  investors: {
    userId: string;
    name: string | null;
    amount: number;
    percentage: number;
    position: number;
  }[];
}

export interface RewardHistoryItem {
  id: string;
  amount: number;
  qaSetId: string;
  qaSetTitle: string | null;
  rewardType: string;
  createdAt: Date;
}

export interface UserBalance {
  balance: number;
  trustLevel: number;
  totalInvested: number;
  totalRewardsEarned: number;
}

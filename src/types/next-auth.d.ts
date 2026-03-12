import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      balance?: number;
      hubScore?: number | null;
      authorityScore?: number;
      trustLevel?: number;
      onboardingCompleted?: boolean;
    };
  }

  interface User {
    id: string;
    balance?: number;
    hubScore?: number | null;
    authorityScore?: number;
    trustLevel?: number;
    onboardingCompleted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { INITIAL_BALANCE } from "@/lib/constants";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // GitHub OAuth (for production)
    ...(process.env.AUTH_GITHUB_ID
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
          }),
        ]
      : []),
    // Demo credentials provider (for development without OAuth)
    Credentials({
      name: "Demo Account",
      credentials: {
        name: { label: "이름", type: "text", placeholder: "홍길동" },
      },
      async authorize(credentials) {
        const name = credentials?.name as string;
        if (!name) return null;

        // Find or create demo user
        const email = `${name.toLowerCase().replace(/\s+/g, "")}@demo.local`;
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          user = await prisma.user.create({
            data: {
              name,
              email,
              balance: INITIAL_BALANCE,
              trustLevel: 1,
            },
          });
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        // Fetch fresh balance and hubScore from DB on every session read
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { balance: true, hubScore: true, authorityScore: true, trustLevel: true, onboardingCompleted: true },
        });
        if (dbUser) {
          session.user.balance = dbUser.balance;
          session.user.hubScore = dbUser.hubScore;
          session.user.authorityScore = dbUser.authorityScore;
          session.user.trustLevel = dbUser.trustLevel;
          session.user.onboardingCompleted = dbUser.onboardingCompleted;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});

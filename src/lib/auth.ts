import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { INITIAL_BALANCE } from "@/lib/constants";

const adapter = PrismaAdapter(prisma);

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Only use adapter for OAuth providers (GitHub).
  // Credentials provider manages users manually in authorize().
  adapter,
  providers: [
    ...(process.env.AUTH_GITHUB_ID
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "Demo Account",
      credentials: {
        name: { label: "이름", type: "text", placeholder: "홍길동" },
      },
      async authorize(credentials) {
        try {
          const name = credentials?.name as string;
          if (!name) return null;

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
        } catch (error) {
          console.error("Demo login error:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Always allow credentials sign-in (user already created in authorize)
      if (account?.provider === "credentials") return true;
      // For OAuth, let adapter handle it
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // For credentials, ensure token.id is set even if adapter didn't run
      if (account?.provider === "credentials" && user?.id) {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        try {
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
        } catch (error) {
          console.error("Session DB lookup error:", error);
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors to login page instead of 500
  },
  trustHost: true,
});

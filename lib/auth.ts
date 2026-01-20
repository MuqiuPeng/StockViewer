/**
 * NextAuth.js configuration for OAuth authentication
 * Uses GitHub OAuth with JWT sessions for edge runtime compatibility
 */

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { UserStatus } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      status?: string;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    status?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt', // Use JWT for edge runtime compatibility
  },
  events: {
    // Auto-approve admin when they first sign up
    async createUser({ user }) {
      const adminGithubId = process.env.ADMIN_GITHUB_ID;
      if (!adminGithubId || !user.id) return;

      // Check if this user's GitHub account matches admin
      const account = await prisma.account.findFirst({
        where: {
          userId: user.id,
          provider: 'github',
          providerAccountId: adminGithubId,
        },
      });

      if (account) {
        // Auto-approve admin
        await prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.APPROVED },
        });
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Include user info in JWT token on sign-in
      if (user) {
        token.id = user.id;
        token.image = user.image;
        token.name = user.name;
        token.email = user.email;

        // Fetch user status from DB
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { status: true },
        });
        token.status = dbUser?.status || UserStatus.PENDING;
      }

      // Refresh status on update trigger or periodically
      if (trigger === 'update' && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { status: true },
        });
        token.status = dbUser?.status || UserStatus.PENDING;
      }

      return token;
    },
    session({ session, token }) {
      // Include user info in session from JWT token
      if (session.user) {
        if (token.id) session.user.id = token.id as string;
        if (token.image) session.user.image = token.image as string;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
        if (token.status) session.user.status = token.status as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});

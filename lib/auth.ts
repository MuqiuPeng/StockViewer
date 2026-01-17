/**
 * NextAuth.js configuration for OAuth authentication
 * Uses GitHub OAuth with JWT sessions for edge runtime compatibility
 */

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
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
  callbacks: {
    jwt({ token, user }) {
      // Include user info in JWT token
      if (user) {
        token.id = user.id;
        token.image = user.image;
        token.name = user.name;
        token.email = user.email;
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
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});

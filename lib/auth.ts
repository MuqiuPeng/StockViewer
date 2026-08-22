/**
 * NextAuth.js configuration for local account authentication.
 *
 * Sign-in is email + password against User.passwordHash, with JWT sessions so
 * that middleware can run on the edge runtime. There is deliberately no
 * external identity provider: this app is served on a local network and must
 * keep working without internet access.
 *
 * Admin rights come from the User.isAdmin / User.isSuperAdmin columns. The
 * previous ADMIN_GITHUB_ID env-var mechanism went away with GitHub OAuth.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
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
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
    };
  }
}

/**
 * Extra claims carried in the JWT. next-auth's JWT is a
 * `Record<string, unknown>`, so these need no module augmentation - which is
 * worth avoiding here, since @auth/core is a nested install of next-auth
 * rather than a top-level package and the augmentation target does not
 * reliably resolve.
 */
interface AuthClaims {
  id?: string;
  status?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // No adapter: the Credentials provider does not use one, and sessions are
  // JWTs rather than rows.
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email.trim().toLowerCase()
            : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
          },
        });

        // Compare against a dummy hash when the user is absent or has no
        // password set, so that the response time does not reveal which.
        const hash =
          user?.passwordHash ??
          '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
        const ok = await bcrypt.compare(password, hash);

        if (!ok || !user?.passwordHash) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt', // Use JWT for edge runtime compatibility
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      const claims = token as AuthClaims;

      // Include user info in JWT token on sign-in
      if (user) {
        claims.id = user.id;
        token.image = user.image;
        token.name = user.name;
        token.email = user.email;
      }

      // Load authorisation state on sign-in, and refresh it when the client
      // asks, so that an approval or a revoked admin flag takes effect without
      // the user having to sign out first.
      if (user || (trigger === 'update' && claims.id)) {
        const dbUser = await prisma.user.findUnique({
          where: { id: claims.id as string },
          select: { status: true, isAdmin: true, isSuperAdmin: true },
        });
        claims.status = dbUser?.status ?? UserStatus.PENDING;
        claims.isAdmin = dbUser?.isAdmin ?? false;
        claims.isSuperAdmin = dbUser?.isSuperAdmin ?? false;
      }

      return token;
    },
    session({ session, token }) {
      const claims = token as AuthClaims;

      // Include user info in session from JWT token
      if (session.user) {
        if (claims.id) session.user.id = claims.id;
        // NextAuth v5 stores image as 'picture' in JWT standard claims
        const image = (token.image || token.picture) as string | undefined;
        if (image) session.user.image = image;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
        if (claims.status) session.user.status = claims.status;
        session.user.isAdmin = claims.isAdmin === true;
        session.user.isSuperAdmin = claims.isSuperAdmin === true;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});

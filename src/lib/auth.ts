// src/lib/auth.ts
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import db from '@/utils/db';
import bcrypt from 'bcryptjs';
import { getPersistentSecret } from '@/lib/credentials';
import { isTurnstileRequired, verifyTurnstileToken } from '@/lib/turnstile';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        if (isTurnstileRequired('adminLogin')) {
          const result = await verifyTurnstileToken(
            String(credentials.turnstileToken || '')
          );
          if (!result.success) {
            return null;
          }
        }

        const user = db.prepare('SELECT id, username, password FROM users WHERE username = ?')
          .get(credentials.username) as { id: number; username: string; password: string } | undefined;

        if (!user) {
          return null;
        }

        if (!user.password.startsWith('$2')) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (isPasswordValid) {
          return {
            id: user.id.toString(),
            name: user.username,
            email: null,
            image: null,
            role: 'admin',
          };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    async session({ session, token }) {
      session.user = session.user || {};
      session.user.role = token.role as string;
      return session;
    },
  },
  session: { strategy: 'jwt' },
  secret: getPersistentSecret(),
};

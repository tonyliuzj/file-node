// src/lib/auth.ts
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import db from '@/utils/db';
import bcrypt from 'bcryptjs';
import { getPersistentSecret } from '@/lib/credentials';
import { isTurnstileRequired, verifyTurnstileToken } from '@/lib/turnstile';
import {
  clearFailures,
  clientIdFromHeaders,
  recordFailure,
  retryAfterSeconds,
} from '@/lib/rate-limit';
import { passwordFingerprint } from '@/lib/password-fingerprint';
import { isTrustedDevice } from '@/lib/trusted-device';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Failed attempts allowed per (client address, username) and per username overall. The second
// cap still holds when the client address header is spoofed.
const LOGIN_LIMIT_PER_CLIENT = 8;
const LOGIN_LIMIT_PER_ACCOUNT = 40;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Compared against when the username does not exist, so an unknown account takes as long to reject
// as a wrong password and cannot be told apart by timing.
const TIMING_EQUALIZER_HASH =
  '$2b$12$QAGxdkg9hhpBY8V2ygabbeGCvkJt/NM2BBb9MEpX/92J7YO3N8q/q';

type UserRow = { id: number; username: string; password: string };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile token', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = String(credentials.username).slice(0, 64);
        const clientKey = `login:${clientIdFromHeaders(req?.headers)}:${username.toLowerCase()}`;
        const accountKey = `login-account:${username.toLowerCase()}`;

        const user = db
          .prepare('SELECT id, username, password FROM users WHERE username = ?')
          .get(username) as UserRow | undefined;

        // A browser that already signed in successfully holds a signed cookie and is let through,
        // so guessers cannot lock the real admin out of their own devices.
        const trustedDevice = user
          ? isTrustedDevice(
              (req?.headers as Record<string, string | undefined> | undefined)?.cookie,
              user
            )
          : false;

        if (
          !trustedDevice &&
          (retryAfterSeconds(clientKey, LOGIN_LIMIT_PER_CLIENT) > 0 ||
            retryAfterSeconds(accountKey, LOGIN_LIMIT_PER_ACCOUNT) > 0)
        ) {
          throw new Error('TooManyAttempts');
        }

        const fail = () => {
          recordFailure(clientKey, LOGIN_WINDOW_MS);
          recordFailure(accountKey, LOGIN_WINDOW_MS);
          return null;
        };

        if (isTurnstileRequired('adminLogin')) {
          const result = await verifyTurnstileToken(
            String(credentials.turnstileToken || '')
          );
          if (!result.success) {
            return fail();
          }
        }

        const hash =
          user && user.password.startsWith('$2')
            ? user.password
            : TIMING_EQUALIZER_HASH;
        const isPasswordValid = await bcrypt.compare(
          String(credentials.password),
          hash
        );

        if (!user || hash === TIMING_EQUALIZER_HASH || !isPasswordValid) {
          return fail();
        }

        // A known browser may have walked past an active throttle; that must not hand the guessers
        // behind it a fresh budget.
        if (!trustedDevice) {
          clearFailures(clientKey);
        }
        return {
          id: user.id.toString(),
          name: user.username,
          email: null,
          image: null,
          role: 'admin',
          pwv: passwordFingerprint(user.password),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const signedIn = user as { id: string; role?: string; pwv?: string };
        token.role = signedIn.role;
        token.uid = signedIn.id;
        token.pwv = signedIn.pwv;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = session.user || {};

      // A token only counts while its account still exists and the password has not changed since
      // it was issued. Anything else is demoted to an anonymous session, which every admin check
      // already rejects.
      const account =
        typeof token.uid === 'string'
          ? (db
              .prepare('SELECT id, username, password FROM users WHERE id = ?')
              .get(Number(token.uid)) as UserRow | undefined)
          : undefined;
      const current =
        account &&
        token.pwv &&
        token.pwv === passwordFingerprint(account.password)
          ? account
          : null;

      session.user.role = current ? (token.role as string) : undefined;
      session.user.name = current ? current.username : null;
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  secret: getPersistentSecret(),
};

// src/app/api/auth/[...nextauth]/route.ts
import { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import db from '@/utils/db';
import { authOptions } from '@/lib/auth';
import { trustedDeviceSetCookie } from '@/lib/trusted-device';

const handler = NextAuth(authOptions);
type RouteContext = Parameters<typeof handler>[1];

export { handler as GET };

export async function POST(req: NextRequest, context: RouteContext) {
  const url = new URL(req.url);
  const isCredentialsSignIn = url.pathname.endsWith('/callback/credentials');
  // The body can only be read once, so read a copy before NextAuth consumes the original.
  const form = isCredentialsSignIn ? await req.clone().formData().catch(() => null) : null;

  const response = await handler(req, context);
  if (!form) return response;

  const signedIn = response.headers
    .getSetCookie()
    .some((cookie: string) => /session-token=[^;]+/.test(cookie));
  if (!signedIn) return response;

  const account = db
    .prepare('SELECT id, password FROM users WHERE username = ?')
    .get(String(form.get('username') ?? '').slice(0, 64)) as
    | { id: number; password: string }
    | undefined;
  if (!account) return response;

  // Remember this browser so a later flood of wrong guesses cannot lock its owner out.
  const secure =
    url.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  const headers = new Headers(response.headers);
  headers.append('set-cookie', trustedDeviceSetCookie(account, secure));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

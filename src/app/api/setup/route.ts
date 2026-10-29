import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import db from '@/utils/db';
import { assertSetupAvailable } from '@/lib/setup';
import { USERNAME_PATTERN, USERNAME_RULE, validateNewPassword } from '@/lib/password';
import {
  clearFailures,
  clientIdFromHeaders,
  recordFailure,
  retryAfterSeconds,
} from '@/lib/rate-limit';

const SETUP_WINDOW_MS = 15 * 60 * 1000;
const SETUP_LIMIT = 10;

// When set, first-run setup also requires this value, so nobody who finds a freshly started
// server can claim the admin account before its owner does.
function requiredSetupToken() {
  return process.env.FILE_NODE_SETUP_TOKEN?.trim() || '';
}

function tokenMatches(provided: string, expected: string) {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET() {
  return NextResponse.json({
    setupRequired: assertSetupAvailable(),
    tokenRequired: Boolean(requiredSetupToken()),
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!assertSetupAvailable()) {
      return NextResponse.json(
        { error: 'Setup has already been completed' },
        { status: 409 }
      );
    }

    const limitKey = `setup:${clientIdFromHeaders(req.headers)}`;
    if (retryAfterSeconds(limitKey, SETUP_LIMIT) > 0) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const expectedToken = requiredSetupToken();
    if (expectedToken) {
      const providedToken =
        typeof body.setupToken === 'string' ? body.setupToken.trim() : '';
      if (!providedToken || !tokenMatches(providedToken, expectedToken)) {
        recordFailure(limitKey, SETUP_WINDOW_MS);
        return NextResponse.json(
          { error: 'Setup token is missing or incorrect' },
          { status: 403 }
        );
      }
    }

    const nextUsername =
      typeof body.username === 'string' ? body.username.trim() : '';
    const nextPassword = typeof body.password === 'string' ? body.password : '';
    const nextConfirmPassword =
      typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!USERNAME_PATTERN.test(nextUsername)) {
      return NextResponse.json({ error: USERNAME_RULE }, { status: 400 });
    }

    const passwordProblem = validateNewPassword(nextPassword);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }

    if (nextPassword !== nextConfirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    const createUser = db.transaction(() => {
      if (!assertSetupAvailable()) {
        throw new Error('Setup has already been completed');
      }

      db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(
        nextUsername,
        bcrypt.hashSync(nextPassword, 12)
      );
    });

    createUser();
    clearFailures(limitKey);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Setup has already been completed'
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Error completing setup:', error);
    return NextResponse.json(
      { error: 'Failed to complete setup' },
      { status: 500 }
    );
  }
}

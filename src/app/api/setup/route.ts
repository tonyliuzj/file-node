import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import db from '@/utils/db';
import { assertSetupAvailable } from '@/lib/setup';

export async function GET() {
  return NextResponse.json({ setupRequired: assertSetupAvailable() });
}

export async function POST(req: NextRequest) {
  try {
    if (!assertSetupAvailable()) {
      return NextResponse.json(
        { error: 'Setup has already been completed' },
        { status: 409 }
      );
    }

    const { username, password, confirmPassword } = await req.json();
    const nextUsername = typeof username === 'string' ? username.trim() : '';
    const nextPassword = typeof password === 'string' ? password : '';
    const nextConfirmPassword =
      typeof confirmPassword === 'string' ? confirmPassword : '';

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(nextUsername)) {
      return NextResponse.json(
        {
          error:
            'Username must be 3-64 characters using letters, numbers, dots, dashes, or underscores',
        },
        { status: 400 }
      );
    }

    if (nextPassword.length < 10) {
      return NextResponse.json(
        { error: 'Password must be at least 10 characters' },
        { status: 400 }
      );
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
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to complete setup';
    const status = message.includes('already been completed') ? 409 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

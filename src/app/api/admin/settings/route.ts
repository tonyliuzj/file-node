// src/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import db from '@/utils/db';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/admin';

export async function PUT(req: NextRequest) {
  try {
    const authErr = await requireAdmin();
    if (authErr) return authErr;

    const { currentPassword, newUsername, newPassword } = await req.json();
    const nextUsername =
      typeof newUsername === 'string' ? newUsername.trim() : '';
    const nextPassword =
      typeof newPassword === 'string' ? newPassword : '';

    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      );
    }

    if (!nextUsername && !nextPassword) {
      return NextResponse.json(
        { error: 'New username or password is required' },
        { status: 400 }
      );
    }
    if (nextUsername && !/^[a-zA-Z0-9._-]{3,64}$/.test(nextUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3-64 characters using letters, numbers, dots, dashes, or underscores' },
        { status: 400 }
      );
    }
    if (nextPassword && nextPassword.length < 10) {
      return NextResponse.json(
        { error: 'New password must be at least 10 characters' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const currentUser = session?.user?.name;

    const user = db
      .prepare('SELECT id, username, password FROM users WHERE username = ?')
      .get(currentUser) as { id: number; username: string; password: string } | undefined;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.password.startsWith('$2')) {
      return NextResponse.json(
        { error: 'Stored password requires migration before it can be used' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    if (nextUsername) {
      const duplicate = db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(nextUsername, user.id) as { id: number } | undefined;
      if (duplicate) {
        return NextResponse.json(
          { error: 'Username is already in use' },
          { status: 409 }
        );
      }
    }

    if (nextUsername && nextPassword) {
      const hashedPassword = await bcrypt.hash(nextPassword, 12);
      db.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?')
        .run(nextUsername, hashedPassword, user.id);
    } else if (nextUsername) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?')
        .run(nextUsername, user.id);
    } else if (nextPassword) {
      const hashedPassword = await bcrypt.hash(nextPassword, 12);
      db.prepare('UPDATE users SET password = ? WHERE id = ?')
        .run(hashedPassword, user.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Credentials updated successfully'
    });
  } catch (error) {
    console.error('Error updating admin credentials:', error);
    return NextResponse.json(
      { error: 'Failed to update credentials' },
      { status: 500 }
    );
  }
}

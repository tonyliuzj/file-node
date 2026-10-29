// src/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import db from '@/utils/db';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/admin';
import {
  checkTurnstileSecret,
  getTurnstileSecretKey,
  getTurnstileSettings,
  updateTurnstileSettings,
} from '@/lib/turnstile';
import { USERNAME_PATTERN, USERNAME_RULE, validateNewPassword } from '@/lib/password';
import { clearFailures, recordFailure, retryAfterSeconds } from '@/lib/rate-limit';

const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_CHANGE_LIMIT = 5;

export async function GET() {
  try {
    const authErr = await requireAdmin();
    if (authErr) return authErr;

    return NextResponse.json({
      turnstile: getTurnstileSettings(),
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authErr = await requireAdmin(req);
    if (authErr) return authErr;

    const body = (await req.json()) as {
      turnstile?: {
        siteKey?: unknown;
        secretKey?: unknown;
        clearSecretKey?: unknown;
        requireBrowse?: unknown;
        requireSearch?: unknown;
        requireAdminLogin?: unknown;
        clearanceMinutes?: unknown;
      };
    };
    const turnstile = body.turnstile || {};
    const currentSettings = getTurnstileSettings();
    const siteKeyProvided = typeof turnstile.siteKey === 'string';
    const siteKey = siteKeyProvided
      ? String(turnstile.siteKey).trim()
      : currentSettings.siteKey;
    const secretKey = typeof turnstile.secretKey === 'string'
      ? turnstile.secretKey.trim()
      : '';
    const clearSecretKey = turnstile.clearSecretKey === true;
    const requireBrowse =
      typeof turnstile.requireBrowse === 'boolean'
        ? turnstile.requireBrowse
        : currentSettings.requireBrowse;
    const requireSearch =
      typeof turnstile.requireSearch === 'boolean'
        ? turnstile.requireSearch
        : currentSettings.requireSearch;
    const requireAdminLogin =
      typeof turnstile.requireAdminLogin === 'boolean'
        ? turnstile.requireAdminLogin
        : currentSettings.requireAdminLogin;
    const clearanceMinutes =
      typeof turnstile.clearanceMinutes === 'number'
        ? turnstile.clearanceMinutes
        : currentSettings.clearanceMinutes;
    const hasSecretAfterSave = clearSecretKey
      ? Boolean(secretKey)
      : Boolean(secretKey || currentSettings.hasSecretKey);

    if ((requireBrowse || requireSearch || requireAdminLogin) && !siteKey) {
      return NextResponse.json(
        { error: 'Turnstile site key is required before enabling protection' },
        { status: 400 }
      );
    }
    if (
      (requireBrowse || requireSearch || requireAdminLogin) &&
      !hasSecretAfterSave
    ) {
      return NextResponse.json(
        { error: 'Turnstile secret key is required before enabling protection' },
        { status: 400 }
      );
    }

    // A wrong secret key would make every protected form unusable, including admin sign-in, so
    // have Cloudflare confirm it before protection is switched on.
    const protectionEnabled = requireBrowse || requireSearch || requireAdminLogin;
    const wasProtected =
      currentSettings.requireBrowse ||
      currentSettings.requireSearch ||
      currentSettings.requireAdminLogin;
    const effectiveSecret =
      secretKey || (clearSecretKey ? '' : getTurnstileSecretKey() || '');
    if (protectionEnabled && effectiveSecret && (secretKey || !wasProtected)) {
      const check = await checkTurnstileSecret(effectiveSecret);
      if (check === 'invalid') {
        return NextResponse.json(
          { error: 'Cloudflare rejected this Turnstile secret key. Check it and try again.' },
          { status: 400 }
        );
      }
      if (check === 'unreachable') {
        return NextResponse.json(
          {
            error:
              'Could not reach Cloudflare to verify the secret key. Protection was not enabled.',
          },
          { status: 502 }
        );
      }
    }

    updateTurnstileSettings({
      siteKey: siteKeyProvided ? siteKey : undefined,
      secretKey,
      clearSecretKey,
      requireBrowse:
        typeof turnstile.requireBrowse === 'boolean' ? requireBrowse : undefined,
      requireSearch:
        typeof turnstile.requireSearch === 'boolean' ? requireSearch : undefined,
      requireAdminLogin:
        typeof turnstile.requireAdminLogin === 'boolean'
          ? requireAdminLogin
          : undefined,
      clearanceMinutes:
        typeof turnstile.clearanceMinutes === 'number'
          ? clearanceMinutes
          : undefined,
    });

    return NextResponse.json({
      success: true,
      turnstile: getTurnstileSettings(),
    });
  } catch (error) {
    console.error('Error updating Turnstile settings:', error);
    return NextResponse.json(
      { error: 'Failed to update Turnstile settings' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authErr = await requireAdmin(req);
    if (authErr) return authErr;

    const { currentPassword, newUsername, newPassword } = await req.json();
    const nextUsername =
      typeof newUsername === 'string' ? newUsername.trim() : '';
    const nextPassword =
      typeof newPassword === 'string' ? newPassword : '';

    if (typeof currentPassword !== 'string' || !currentPassword) {
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
    if (nextUsername && !USERNAME_PATTERN.test(nextUsername)) {
      return NextResponse.json({ error: USERNAME_RULE }, { status: 400 });
    }
    if (nextPassword) {
      const passwordProblem = validateNewPassword(nextPassword);
      if (passwordProblem) {
        return NextResponse.json({ error: passwordProblem }, { status: 400 });
      }
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

    // Changing credentials re-asks for the password, so a stolen session cookie must not be able
    // to use this form to guess it.
    const limitKey = `password-change:${user.id}`;
    if (retryAfterSeconds(limitKey, PASSWORD_CHANGE_LIMIT) > 0) {
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Try again later.' },
        { status: 429 }
      );
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      recordFailure(limitKey, PASSWORD_CHANGE_WINDOW_MS);
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }
    clearFailures(limitKey);

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

// src/app/api/backends/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/utils/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { protectSecret } from '@/lib/credentials';
import { requireAdmin } from '@/lib/admin';
import { normalizeHttpUrl } from '@/lib/security';

type BackendBody = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  authEnabled?: unknown;
  username?: unknown;
  password?: unknown;
  rescanInterval?: unknown;
};

type StoredBackend = {
  id: number;
  password: string | null;
};

function normalizeLabel(name: unknown, url: string) {
  if (typeof name !== 'string') return new URL(url).host;
  const label = name.trim().slice(0, 120);
  return label || new URL(url).host;
}

function normalizeOptionalString(value: unknown, maxLength = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeRescanInterval(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1 || interval > 525600) {
    return undefined;
  }
  return interval;
}

function getAdminDetails() {
  return db
    .prepare(`
      SELECT
        b.id,
        b.name,
        b.url,
        b.authEnabled,
        b.username,
        b.password IS NOT NULL AS hasPassword,
        b.rescanInterval,
        b.scannedAt,
        COUNT(f.id) AS fileCount
      FROM backends b
      LEFT JOIN files f ON f.backendId = b.id
      GROUP BY b.id
      ORDER BY b.id
    `)
    .all();
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    const isAdmin = session && user?.role === 'admin';

    const list = isAdmin
      ? getAdminDetails()
      : db
          .prepare(`
            SELECT
              b.id,
              b.name,
              b.scannedAt,
              COUNT(f.id) AS fileCount
            FROM backends b
            LEFT JOIN files f ON f.backendId = b.id
            GROUP BY b.id
            ORDER BY b.id
          `)
          .all();
    return NextResponse.json(list);
  } catch (error) {
    console.error('Error fetching backends:', error);
    return NextResponse.json(
      { error: 'Failed to fetch backends' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authErr = await requireAdmin();
    if (authErr) return authErr;

    const body = (await req.json()) as BackendBody;
    const url = normalizeHttpUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: 'Backend URL must be a valid http or https URL' },
        { status: 400 }
      );
    }

    const rescanInterval = normalizeRescanInterval(body.rescanInterval);
    if (rescanInterval === undefined) {
      return NextResponse.json(
        { error: 'Rescan interval must be between 1 and 525600 minutes' },
        { status: 400 }
      );
    }

    const authEnabled = Boolean(body.authEnabled);
    const username = authEnabled ? normalizeOptionalString(body.username) : null;
    const password = authEnabled ? normalizeOptionalString(body.password, 2000) : null;
    if (authEnabled && (!username || !password)) {
      return NextResponse.json(
        { error: 'Username and password are required when auth is enabled' },
        { status: 400 }
      );
    }

    const label = normalizeLabel(body.name, url);

    db.prepare(`
      INSERT INTO backends
        (name, url, authEnabled, username, password, rescanInterval)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      label,
      url,
      authEnabled ? 1 : 0,
      username,
      protectSecret(password),
      rescanInterval
    );

    const created = db
      .prepare('SELECT last_insert_rowid() AS id')
      .get() as { id: number };
    const row = db
      .prepare('SELECT id, name, url, authEnabled, username, password IS NOT NULL AS hasPassword, rescanInterval, scannedAt FROM backends WHERE id = ?')
      .get(created.id);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error('Error creating backend:', error);
    return NextResponse.json(
      { error: 'Failed to create backend' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authErr = await requireAdmin();
    if (authErr) return authErr;

    const body = (await req.json()) as BackendBody;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid backend id' }, { status: 400 });
    }

    const existing = db
      .prepare('SELECT id, password FROM backends WHERE id = ?')
      .get(id) as StoredBackend | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Backend not found' }, { status: 404 });
    }

    const url = normalizeHttpUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: 'Backend URL must be a valid http or https URL' },
        { status: 400 }
      );
    }

    const rescanInterval = normalizeRescanInterval(body.rescanInterval);
    if (rescanInterval === undefined) {
      return NextResponse.json(
        { error: 'Rescan interval must be between 1 and 525600 minutes' },
        { status: 400 }
      );
    }

    const authEnabled = Boolean(body.authEnabled);
    const username = authEnabled ? normalizeOptionalString(body.username) : null;
    const submittedPassword = normalizeOptionalString(body.password, 2000);
    const password = authEnabled
      ? submittedPassword
        ? protectSecret(submittedPassword)
        : existing.password
      : null;

    if (authEnabled && (!username || !password)) {
      return NextResponse.json(
        { error: 'Username and password are required when auth is enabled' },
        { status: 400 }
      );
    }

    const label = normalizeLabel(body.name, url);

    db.prepare(`
      UPDATE backends
         SET name = ?, url = ?, authEnabled = ?, username = ?, password = ?, rescanInterval = ?
       WHERE id = ?
    `).run(
      label,
      url,
      authEnabled ? 1 : 0,
      username,
      password,
      rescanInterval,
      id
    );

    const updated = db
      .prepare('SELECT id, name, url, authEnabled, username, password IS NOT NULL AS hasPassword, rescanInterval, scannedAt FROM backends WHERE id = ?')
      .get(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating backend:', error);
    return NextResponse.json(
      { error: 'Failed to update backend' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authErr = await requireAdmin();
    if (authErr) return authErr;

    const { id } = await req.json();
    const delId = Number(id);
    if (!Number.isInteger(delId) || delId < 1) {
      return NextResponse.json({ error: 'Invalid backend id' }, { status: 400 });
    }

    db.prepare('DELETE FROM backends WHERE id = ?').run(delId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting backend:', error);
    return NextResponse.json(
      { error: 'Failed to delete backend' },
      { status: 500 }
    );
  }
}

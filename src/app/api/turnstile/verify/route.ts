import { NextRequest, NextResponse } from 'next/server';
import {
  createTurnstileClearance,
  getRequestIp,
  isTurnstileRequired,
  setTurnstileClearance,
  verifyTurnstileToken,
  type TurnstileArea,
} from '@/lib/turnstile';

const allowedAreas = new Set<TurnstileArea>(['browse', 'search']);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      area?: unknown;
      token?: unknown;
    };
    const area = body.area;
    const token = typeof body.token === 'string' ? body.token : '';

    if (area !== 'browse' && area !== 'search') {
      return NextResponse.json({ error: 'Invalid verification area' }, { status: 400 });
    }
    if (!allowedAreas.has(area) || !isTurnstileRequired(area)) {
      return NextResponse.json({ success: true });
    }

    const result = await verifyTurnstileToken(token, getRequestIp(request));
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Verification failed' },
        { status: 403 }
      );
    }

    const clearance = createTurnstileClearance(area);
    const response = NextResponse.json({ success: true, clearance });
    setTurnstileClearance(response, area, clearance);
    return response;
  } catch (error) {
    console.error('Error verifying Turnstile token:', error);
    return NextResponse.json(
      { error: 'Failed to verify Turnstile token' },
      { status: 500 }
    );
  }
}

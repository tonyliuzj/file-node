import { redirect } from 'next/navigation';

import { hasAdminUser } from '@/lib/setup';
import { getTurnstileSettings, isTurnstileRequired } from '@/lib/turnstile';
import SignInClient from './signin-client';

export const dynamic = 'force-dynamic';

export default function AdminSignInPage() {
  if (!hasAdminUser()) {
    redirect('/setup');
  }

  const turnstile = getTurnstileSettings();

  return (
    <SignInClient
      turnstileSiteKey={turnstile.siteKey}
      requireTurnstile={isTurnstileRequired('adminLogin')}
    />
  );
}

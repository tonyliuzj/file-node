import { redirect } from 'next/navigation';

import { hasAdminUser } from '@/lib/setup';
import SignInClient from './signin-client';

export const dynamic = 'force-dynamic';

export default function AdminSignInPage() {
  if (!hasAdminUser()) {
    redirect('/setup');
  }

  return <SignInClient />;
}

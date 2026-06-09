import { redirect } from 'next/navigation';

import { hasAdminUser } from '@/lib/setup';
import SetupClient from './setup-client';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  if (hasAdminUser()) {
    redirect('/admin/signin');
  }

  return <SetupClient />;
}

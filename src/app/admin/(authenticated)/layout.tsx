import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { hasAdminUser } from '@/lib/setup';
import AdminNav from './admin-nav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasAdminUser()) {
    redirect('/setup');
  }

  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session || user?.role !== 'admin') {
    redirect('/admin/signin');
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <AdminNav />
      {children}
    </div>
  );
}

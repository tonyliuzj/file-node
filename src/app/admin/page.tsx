import { redirect } from 'next/navigation';
import { hasAdminUser } from '@/lib/setup';

export default function AdminPage() {
  if (!hasAdminUser()) {
    redirect('/setup');
  }

  redirect('/admin/backends');
}

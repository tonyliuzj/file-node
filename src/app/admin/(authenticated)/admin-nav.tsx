'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Server, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';

const adminNav = [
  { href: '/admin/backends', label: 'Backends', icon: Server },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl gap-2 px-4 py-3 md:px-6">
        {adminNav.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
            >
              <Link href={item.href}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

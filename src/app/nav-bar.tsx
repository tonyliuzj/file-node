'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowLeft,
  FolderOpen,
  HardDrive,
  Library,
  Menu,
  Monitor,
  Moon,
  Search,
  Shield,
  Sun,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Library },
  { href: '/files/browse', label: 'Browse', icon: FolderOpen },
  { href: '/files/search', label: 'Search', icon: Search },
  { href: '/admin/backends', label: 'Admin', icon: Shield },
];

function decodeFileName(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value.split('/').pop() || value);
  } catch {
    return value.split('/').pop() || value;
  }
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isViewer =
    /^\/files\/[^/]+$/.test(pathname) &&
    !pathname.includes('/search') &&
    !pathname.includes('/browse');
  const fileName = isViewer
    ? decodeFileName(searchParams.get('path'))
    : null;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-6">
        {isViewer ? (
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Library className="h-5 w-5 text-primary" />
                  File Node
                </SheetTitle>
              </SheetHeader>
              <nav className="grid gap-1 p-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.href}
                      asChild
                      variant={isActive(item.href) ? 'secondary' : 'ghost'}
                      className="justify-start"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        )}

        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-semibold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-card">
            <HardDrive className="h-4 w-4 text-primary" />
          </span>
          <span className="hidden sm:inline">File Node</span>
        </Link>

        {isViewer && fileName ? (
          <>
            <Separator orientation="vertical" className="h-6" />
            <div className="min-w-0 flex-1 truncate text-sm font-medium">
              {fileName}
            </div>
          </>
        ) : (
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              {navItems.slice(1).map((item) => {
                const Icon = item.icon;
                return (
                  <NavigationMenuItem key={item.href}>
                    <NavigationMenuLink
                      asChild
                      className={cn(
                        navigationMenuTriggerStyle(),
                        'gap-2',
                        isActive(item.href) && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        )}

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Sun className="h-[1.15rem] w-[1.15rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.15rem] w-[1.15rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="mr-2 h-4 w-4" />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                <Monitor className="mr-2 h-4 w-4" />
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

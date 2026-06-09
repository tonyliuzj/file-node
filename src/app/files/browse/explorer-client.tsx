'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTurnstileClearance } from '@/components/turnstile-clearance-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TURNSTILE_CLEARANCE_HEADER } from '@/lib/turnstile-shared';
import { cn } from '@/lib/utils';

type Entry = {
  id: number;
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: string | null;
};

type Backend = {
  id: number;
  name: string;
  scannedAt?: string | null;
  fileCount?: number;
};

type SidebarContentProps = {
  backends: Backend[];
  backendId: number | null;
  loadingBackends: boolean;
  onSelectBackend: (backendId: number) => void;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(value: string) {
  let path = value || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  return path;
}

function formatBytes(value: number | null) {
  if (!value) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not scanned';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function fileIcon(entry: Entry) {
  if (entry.isDirectory) return Folder;
  const ext = entry.name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '')) {
    return FileImage;
  }
  if (['mp4', 'webm', 'mov', 'mkv', 'ogg'].includes(ext || '')) {
    return FileVideo;
  }
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext || '')) {
    return FileAudio;
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext || '')) {
    return FileArchive;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'xml', 'yaml'].includes(ext || '')) {
    return FileCode;
  }
  if (['md', 'markdown', 'txt', 'csv', 'pdf'].includes(ext || '')) {
    return FileText;
  }
  return File;
}

function SidebarContent({
  backends,
  backendId,
  loadingBackends,
  onSelectBackend,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4" />
          Storage
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid gap-1 p-3">
          {loadingBackends ? (
            <>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </>
          ) : backends.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No backends configured.
            </div>
          ) : (
            backends.map((backend) => (
              <Button
                key={backend.id}
                variant={backend.id === backendId ? 'secondary' : 'ghost'}
                className="h-auto justify-start gap-3 px-3 py-2"
                onClick={() => onSelectBackend(backend.id)}
              >
                <Database className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{backend.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {(backend.fileCount ?? 0).toLocaleString()} indexed
                  </span>
                </span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function ExplorerClient() {
  const router = useRouter();
  const params = useSearchParams();
  const turnstileClearance = useTurnstileClearance();
  const backendIdParam = params.get('backendId') || '';
  const pathParam = normalizePath(params.get('path') || '/');
  const backendId = backendIdParam ? Number(backendIdParam) : null;

  const [backends, setBackends] = useState<Backend[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingBackends, setLoadingBackends] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadBackends() {
      setLoadingBackends(true);
      try {
        const res = await fetch('/api/backends', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load backends');
        const data = (await res.json()) as Backend[];
        if (!mounted) return;
        setBackends(data);

        if (!backendIdParam && data[0]) {
          router.replace(`/files/browse?backendId=${data[0].id}&path=%2F`);
        }
      } catch {
        if (mounted) toast.error('Unable to load storage backends');
      } finally {
        if (mounted) setLoadingBackends(false);
      }
    }

    loadBackends();
    return () => {
      mounted = false;
    };
  }, [backendIdParam, router]);

  useEffect(() => {
    if (backendId == null || Number.isNaN(backendId)) {
      return;
    }

    let mounted = true;
    async function loadEntries() {
      setLoadingEntries(true);
      setEntries([]);
      try {
        const res = await fetch(
          `/api/files/explorer?backendId=${backendId}&path=${encodeURIComponent(pathParam)}`,
          {
            cache: 'no-store',
            headers: turnstileClearance
              ? { [TURNSTILE_CLEARANCE_HEADER]: turnstileClearance }
              : undefined,
          }
        );
        if (!res.ok) throw new Error('Failed to load directory');
        const data = (await res.json()) as Entry[];
        if (!mounted) return;
        setEntries(data);
      } catch {
        if (mounted) toast.error('Unable to load this directory from the index');
      } finally {
        if (mounted) setLoadingEntries(false);
      }
    }

    loadEntries();
    return () => {
      mounted = false;
    };
  }, [backendId, pathParam, turnstileClearance]);

  const activeBackend = backends.find((backend) => backend.id === backendId);
  const crumbs = useMemo(() => {
    const parts = pathParam.split('/').filter(Boolean);
    return parts.map((part, index) => {
      return {
        label: safeDecode(part),
        path: `/${parts.slice(0, index + 1).join('/')}`,
        isLast: index === parts.length - 1,
      };
    });
  }, [pathParam]);

  const updateUrl = (newBackend: number | null, newPath: string) => {
    const normalizedPath = normalizePath(newPath);
    const url = newBackend
      ? `/files/browse?backendId=${newBackend}&path=${encodeURIComponent(normalizedPath)}`
      : '/files/browse';
    router.push(url);
    setMobileSidebarOpen(false);
  };

  const openParent = () => {
    const parts = pathParam.split('/').filter(Boolean);
    parts.pop();
    updateUrl(backendId, parts.length ? `/${parts.join('/')}` : '/');
  };

  const openEntry = (entry: Entry) => {
    if (!backendId) return;
    if (entry.isDirectory) {
      updateUrl(backendId, entry.path.endsWith('/') ? entry.path : `${entry.path}/`);
      return;
    }

    router.push(
      `/files/${entry.id}?backendId=${backendId}&path=${encodeURIComponent(entry.path)}`
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background">
      <aside className="hidden w-72 shrink-0 border-r md:block">
        <SidebarContent
          backends={backends}
          backendId={backendId}
          loadingBackends={loadingBackends}
          onSelectBackend={(selectedBackendId) => updateUrl(selectedBackendId, '/')}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-16 items-center gap-3 border-b px-4">
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <HardDrive className="h-4 w-4" />
                <span className="sr-only">Select backend</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Storage backends</SheetTitle>
              </SheetHeader>
              <SidebarContent
                backends={backends}
                backendId={backendId}
                loadingBackends={loadingBackends}
                onSelectBackend={(selectedBackendId) => updateUrl(selectedBackendId, '/')}
              />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">
                {activeBackend?.name || 'Browse files'}
              </h1>
              {activeBackend && (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {formatDate(activeBackend.scannedAt)}
                </Badge>
              )}
            </div>
            <Breadcrumb className="mt-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  {backendId ? (
                    <BreadcrumbLink
                      className="cursor-pointer"
                      onClick={() => updateUrl(backendId, '/')}
                    >
                      Root
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>Root</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {crumbs.map((crumb) => (
                  <React.Fragment key={crumb.path}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {crumb.isLast ? (
                        <BreadcrumbPage className="max-w-40 truncate sm:max-w-72">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          className="max-w-32 cursor-pointer truncate sm:max-w-56"
                          onClick={() => updateUrl(backendId, crumb.path)}
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/files/search">
              <Search className="h-4 w-4" />
              Search
            </Link>
          </Button>
        </div>

        {!backendId || Number.isNaN(backendId) ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Card className="w-full max-w-md text-center shadow-sm">
              <CardHeader>
                <CardTitle>Select a backend</CardTitle>
                <CardDescription>
                  Choose a configured storage backend to browse the SQLite
                  index.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/admin/backends">
                    <HardDrive className="h-4 w-4" />
                    Manage Backends
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-4">
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  {loadingEntries ? (
                    <div className="space-y-3 p-4">
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                    </div>
                  ) : entries.length === 0 && pathParam === '/' ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
                      <Folder className="h-10 w-10 text-muted-foreground" />
                      <div>
                        <p className="font-medium">No indexed entries</p>
                        <p className="text-sm text-muted-foreground">
                          Run a backend scan from admin to populate this view.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">
                            Type
                          </TableHead>
                          <TableHead className="hidden md:table-cell">
                            Size
                          </TableHead>
                          <TableHead className="hidden lg:table-cell">
                            Modified
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pathParam !== '/' && (
                          <TableRow
                            className="cursor-pointer"
                            onClick={openParent}
                          >
                            <TableCell colSpan={4}>
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                                  <ArrowLeft className="h-4 w-4" />
                                </span>
                                <span className="font-medium">Parent folder</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {entries.map((entry) => {
                          const Icon = fileIcon(entry);
                          const ext = entry.isDirectory
                            ? 'Folder'
                            : entry.name.split('.').pop()?.toUpperCase() || 'File';

                          return (
                            <TableRow
                              key={entry.id}
                              className="cursor-pointer"
                              onClick={() => openEntry(entry)}
                            >
                              <TableCell>
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className={cn(
                                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                                      entry.isDirectory
                                        ? 'bg-primary/10 text-primary'
                                        : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {safeDecode(entry.name)}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground md:hidden">
                                      {ext}
                                      <span className="px-1">/</span>
                                      {entry.isDirectory ? 'Browse' : formatBytes(entry.size)}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline">{ext}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {entry.isDirectory ? '-' : formatBytes(entry.size)}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {entry.modifiedAt
                                  ? formatDate(entry.modifiedAt)
                                  : '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        )}

        <Separator />
      </section>
    </div>
  );
}

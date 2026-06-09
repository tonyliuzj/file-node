'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Database,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSearch,
  FileText,
  FileVideo,
  Folder,
  Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTurnstileClearance } from '@/components/turnstile-clearance-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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

type SearchResult = {
  id: number;
  backendId: number;
  path: string;
  name: string;
  isDirectory: number | boolean;
  size: number | null;
  modifiedAt: string | null;
  scannedAt: string | null;
};

type Backend = {
  id: number;
  name: string;
  fileCount?: number;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

function fileIcon(result: SearchResult) {
  if (Boolean(result.isDirectory)) return Folder;
  const ext = result.name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '')) {
    return FileImage;
  }
  if (['mp4', 'webm', 'mov', 'mkv', 'ogg'].includes(ext || '')) {
    return FileVideo;
  }
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext || '')) {
    return FileAudio;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'xml', 'yaml'].includes(ext || '')) {
    return FileCode;
  }
  if (['md', 'markdown', 'txt', 'csv', 'pdf'].includes(ext || '')) {
    return FileText;
  }
  return File;
}

export default function SearchPageClient() {
  const searchParams = useSearchParams();
  const turnstileClearance = useTurnstileClearance();
  const q = searchParams.get('q') || '';
  const [backends, setBackends] = useState<Backend[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchBackends() {
      try {
        const backendsRes = await fetch('/api/backends', { cache: 'no-store' });
        if (!backendsRes.ok) throw new Error('Failed to load backends');
        const data = (await backendsRes.json()) as Backend[];
        if (mounted) setBackends(data);
      } catch {
        if (mounted) toast.error('Unable to load backend metadata');
      }
    }

    fetchBackends();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function searchFiles() {
      if (!q.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const resultsRes = await fetch(
          `/api/files/search?q=${encodeURIComponent(q)}`,
          {
            cache: 'no-store',
            headers: turnstileClearance
              ? { [TURNSTILE_CLEARANCE_HEADER]: turnstileClearance }
              : undefined,
          }
        );
        if (!resultsRes.ok) throw new Error('Search failed');
        const data = (await resultsRes.json()) as SearchResult[];
        if (mounted) setResults(data);
      } catch {
        if (mounted) {
          setResults([]);
          toast.error('Search failed against the file index');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    searchFiles();
    return () => {
      mounted = false;
    };
  }, [q, turnstileClearance]);

  const backendMap = useMemo(() => {
    return new Map(backends.map((backend) => [backend.id, backend]));
  }, [backends]);

  const indexedCount = backends.reduce(
    (total, backend) => total + (backend.fileCount ?? 0),
    0
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <Card className="shadow-sm">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <FileSearch className="h-3.5 w-3.5" />
              Search
            </Badge>
            <div>
              <CardTitle className="text-2xl">Find indexed files</CardTitle>
              <CardDescription>
                Search names across all configured backends.
              </CardDescription>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border px-3 py-2">
              <div className="text-muted-foreground">Backends</div>
              <div className="text-lg font-semibold">{backends.length}</div>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <div className="text-muted-foreground">Indexed</div>
              <div className="text-lg font-semibold">
                {indexedCount.toLocaleString()}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search by name"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <Button type="submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              {q ? `${results.length} match${results.length === 1 ? '' : 'es'} for "${q}"` : 'Enter a query to search the index.'}
            </CardDescription>
          </div>
          {loading && (
            <Badge variant="outline" className="w-fit gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : q && results.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
              <Search className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No matches</p>
                <p className="text-sm text-muted-foreground">
                  Try a shorter term or rescan your backends.
                </p>
              </div>
            </div>
          ) : !q ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
              <Database className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Search the SQLite index</p>
                <p className="text-sm text-muted-foreground">
                  Results appear here without crawling backends live.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Backend</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => {
                  const backend = backendMap.get(result.backendId);
                  const isDirectory = Boolean(result.isDirectory);
                  const Icon = fileIcon(result);
                  const href = isDirectory
                    ? `/files/browse?backendId=${result.backendId}&path=${encodeURIComponent(result.path)}`
                    : `/files/${result.id}?backendId=${result.backendId}&path=${encodeURIComponent(result.path)}`;
                  const parentPath =
                    result.path.substring(0, result.path.lastIndexOf('/')) || '/';

                  return (
                    <TableRow key={result.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                              isDirectory
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {safeDecode(result.name || result.path.split('/').pop() || result.path)}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {safeDecode(parentPath)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">
                          {backend?.name || `Backend #${result.backendId}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {isDirectory ? '-' : formatBytes(result.size)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={href}>
                            {isDirectory ? 'Browse' : 'Preview'}
                          </Link>
                        </Button>
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
  );
}

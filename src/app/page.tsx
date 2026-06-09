import Link from 'next/link';
import {
  Database,
  FileSearch,
  FolderOpen,
  HardDrive,
  Library,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import db from '@/utils/db';

export const dynamic = 'force-dynamic';

type BackendSummary = {
  id: number;
  name: string;
  scannedAt: string | null;
  fileCount: number;
};

type Stats = {
  backendCount: number;
  fileCount: number;
  folderCount: number;
  lastScannedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return 'Not scanned';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getStats() {
  const stats = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM backends) AS backendCount,
        (SELECT COUNT(*) FROM files WHERE isDirectory = 0) AS fileCount,
        (SELECT COUNT(*) FROM files WHERE isDirectory = 1) AS folderCount,
        (SELECT MAX(scannedAt) FROM backends) AS lastScannedAt
    `)
    .get() as Stats;

  const backends = db
    .prepare(`
      SELECT
        b.id,
        b.name,
        b.scannedAt,
        COUNT(f.id) AS fileCount
      FROM backends b
      LEFT JOIN files f ON f.backendId = b.id
      GROUP BY b.id
      ORDER BY b.id
      LIMIT 8
    `)
    .all() as BackendSummary[];

  return { stats, backends };
}

export default function HomePage() {
  const { stats, backends } = getStats();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit gap-1.5">
                  <Library className="h-3.5 w-3.5" />
                  File Node
                </Badge>
                <CardTitle className="text-2xl md:text-3xl">
                  Self-hosted file index
                </CardTitle>
                <CardDescription className="max-w-2xl">
                  Connect HTTP directory backends, index their files into SQLite,
                  and browse or search from one interface.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/files/browse">
                    <FolderOpen className="h-4 w-4" />
                    Browse
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/files/search">
                    <FileSearch className="h-4 w-4" />
                    Search
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  Backends
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {stats.backendCount}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-4 w-4" />
                  Indexed Files
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {stats.fileCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderOpen className="h-4 w-4" />
                  Folders
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {stats.folderCount.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4" />
                  Last Scan
                </div>
                <div className="mt-2 text-sm font-medium">
                  {formatDate(stats.lastScannedAt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Self-hosting Controls
            </CardTitle>
            <CardDescription>
              Admin-only controls manage backend credentials and indexing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">SQLite index</span>
                <Badge variant="outline">Enabled</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Backend secrets</span>
                <Badge variant="outline">Server-side</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Manual scans</span>
                <Badge variant="outline">Admin</Badge>
              </div>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/admin/backends">
                <HardDrive className="h-4 w-4" />
                Manage Backends
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Connected Backends</CardTitle>
            <CardDescription>
              Indexed sources available to the browser and search views.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/backends">
              <HardDrive className="h-4 w-4" />
              Configure
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {backends.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
              <HardDrive className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No backends configured</p>
                <p className="text-sm text-muted-foreground">
                  Add a backend in admin to start indexing files.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Indexed Entries</TableHead>
                  <TableHead>Last Scan</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backends.map((backend) => (
                  <TableRow key={backend.id}>
                    <TableCell className="font-medium">{backend.name}</TableCell>
                    <TableCell>{backend.fileCount.toLocaleString()}</TableCell>
                    <TableCell>{formatDate(backend.scannedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/files/browse?backendId=${backend.id}&path=%2F`}>
                          Browse
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Edit2,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Backend = {
  id: number;
  name: string;
  url: string;
  authEnabled: number | boolean;
  username?: string | null;
  hasPassword?: number | boolean;
  rescanInterval?: number | null;
  scannedAt?: string | null;
  fileCount?: number;
};

type BackendForm = {
  id?: number;
  name: string;
  url: string;
  authEnabled: boolean;
  username: string;
  password: string;
  rescanInterval: string;
};

const emptyForm: BackendForm = {
  name: '',
  url: '',
  authEnabled: false,
  username: '',
  password: '',
  rescanInterval: '',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not scanned';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

export default function AdminClient() {
  const [backends, setBackends] = useState<Backend[]>([]);
  const [form, setForm] = useState<BackendForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function refreshBackends() {
    const res = await fetch('/api/backends', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load backends');
    setBackends((await res.json()) as Backend[]);
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/backends', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load backends');
        const data = (await res.json()) as Backend[];
        if (mounted) setBackends(data);
      } catch {
        if (mounted) toast.error('Unable to load backends');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const activeBackend = useMemo(
    () => backends.find((backend) => backend.id === form.id),
    [backends, form.id]
  );

  async function save() {
    const url = normalizeUrl(form.url);
    if (!url) {
      toast.error('Backend URL is required');
      return;
    }
    if (form.authEnabled && (!form.username.trim() || (!form.password && !activeBackend?.hasPassword))) {
      toast.error('Username and password are required when authentication is enabled');
      return;
    }

    const interval = form.rescanInterval.trim()
      ? Number(form.rescanInterval)
      : null;
    if (interval !== null && (!Number.isInteger(interval) || interval < 1)) {
      toast.error('Rescan interval must be a whole number of minutes');
      return;
    }

    setSaving(true);
    try {
      const method = form.id ? 'PUT' : 'POST';
      const body = {
        id: form.id,
        name: form.name,
        url,
        authEnabled: form.authEnabled,
        username: form.authEnabled ? form.username : undefined,
        password: form.authEnabled && form.password ? form.password : undefined,
        rescanInterval: interval,
      };
      const res = await fetch('/api/backends', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save backend');

      await refreshBackends();
      setForm(emptyForm);
      toast.success(form.id ? 'Backend updated' : 'Backend added');

      if (!form.id) {
        await rescan(data.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save backend');
    } finally {
      setSaving(false);
    }
  }

  async function rescan(id: number) {
    setScanningId(id);
    try {
      const res = await fetch('/api/backends/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      await refreshBackends();
      toast.success('Scan completed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan backend');
    } finally {
      setScanningId(null);
    }
  }

  async function deleteBackend() {
    if (deleteId === null) return;
    try {
      const res = await fetch('/api/backends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete backend');
      await refreshBackends();
      toast.success('Backend deleted');
      if (form.id === deleteId) setForm(emptyForm);
      setDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete backend');
    }
  }

  function edit(backend: Backend) {
    setForm({
      id: backend.id,
      name: backend.name,
      url: backend.url,
      authEnabled: Boolean(backend.authEnabled),
      username: backend.username || '',
      password: '',
      rescanInterval:
        backend.rescanInterval === null || backend.rescanInterval === undefined
          ? ''
          : String(backend.rescanInterval),
    });
    document.getElementById('backend-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  const totalIndexed = backends.reduce(
    (total, backend) => total + (backend.fileCount ?? 0),
    0
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <Card className="shadow-sm">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Badge>
            <div>
              <CardTitle className="text-2xl">Storage backends</CardTitle>
              <CardDescription>
                Connect HTTP directory listings, protect credentials, and keep
                the SQLite index fresh.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Backends</div>
              <div className="mt-2 text-2xl font-semibold">{backends.length}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Indexed Entries</div>
              <div className="mt-2 text-2xl font-semibold">
                {totalIndexed.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Protected Secrets</div>
              <div className="mt-2 text-2xl font-semibold">
                {backends.filter((backend) => backend.hasPassword).length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Configured Backends</CardTitle>
            <CardDescription>
              Scans read directory listings into the local database.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : backends.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                <Server className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">No backends yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add your first backend to start indexing.
                  </p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Index</TableHead>
                    <TableHead className="hidden md:table-cell">Scan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backends.map((backend) => (
                    <TableRow key={backend.id}>
                      <TableCell>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {backend.name}
                            </span>
                            {backend.authEnabled ? (
                              <Badge variant="outline">Auth</Badge>
                            ) : null}
                          </div>
                          <a
                            href={backend.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-muted-foreground hover:underline"
                          >
                            {backend.url}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {(backend.fileCount ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="space-y-1 text-sm">
                          <div>{formatDate(backend.scannedAt)}</div>
                          <div className="text-xs text-muted-foreground">
                            {backend.rescanInterval
                              ? `Every ${backend.rescanInterval}m`
                              : 'Manual'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => edit(backend)}
                            title="Edit backend"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => rescan(backend.id)}
                            disabled={scanningId === backend.id}
                            title="Rescan backend"
                          >
                            {scanningId === backend.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Dialog
                            open={deleteId === backend.id}
                            onOpenChange={(open) =>
                              setDeleteId(open ? backend.id : null)
                            }
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                title="Delete backend"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Delete backend</DialogTitle>
                                <DialogDescription>
                                  Delete {backend.name} and its indexed files
                                  from the local database.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={deleteBackend}
                                >
                                  Delete
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm" id="backend-form">
          <CardHeader>
            <CardTitle>{form.id ? 'Edit Backend' : 'Add Backend'}</CardTitle>
            <CardDescription>
              Use an HTTP or HTTPS directory listing as a file source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                placeholder="Media server"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={form.url}
                placeholder="http://localhost:8080/files"
                onChange={(event) =>
                  setForm({ ...form, url: event.target.value })
                }
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="authEnabled">Basic authentication</Label>
                <p className="text-xs text-muted-foreground">
                  Credentials are stored encrypted and used only server-side.
                </p>
              </div>
              <Switch
                id="authEnabled"
                checked={form.authEnabled}
                onCheckedChange={(checked) =>
                  setForm({ ...form, authEnabled: checked })
                }
                disabled={saving}
              />
            </div>

            {form.authEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(event) =>
                      setForm({ ...form, username: event.target.value })
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password
                    {form.id && activeBackend?.hasPassword ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        leave blank to keep
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="rescanInterval">Auto-rescan interval</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rescanInterval"
                  type="number"
                  min="1"
                  placeholder="Manual"
                  value={form.rescanInterval}
                  onChange={(event) =>
                    setForm({ ...form, rescanInterval: event.target.value })
                  }
                  disabled={saving}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setForm(emptyForm)}
              disabled={saving}
            >
              Clear
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {form.id ? 'Update Backend' : 'Add Backend'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

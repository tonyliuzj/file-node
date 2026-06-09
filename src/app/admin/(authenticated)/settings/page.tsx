'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Shield,
} from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

type TurnstileSettings = {
  siteKey: string;
  hasSecretKey: boolean;
  requireBrowse: boolean;
  requireSearch: boolean;
  requireAdminLogin: boolean;
  configured: boolean;
};

const emptyTurnstileSettings: TurnstileSettings = {
  siteKey: '',
  hasSecretKey: false,
  requireBrowse: false,
  requireSearch: false,
  requireAdminLogin: false,
  configured: false,
};

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstile, setTurnstile] = useState<TurnstileSettings>(
    emptyTurnstileSettings
  );
  const [turnstileSecretKey, setTurnstileSecretKey] = useState('');
  const [clearTurnstileSecretKey, setClearTurnstileSecretKey] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(true);
  const [turnstileSaving, setTurnstileSaving] = useState(false);
  const [turnstileError, setTurnstileError] = useState('');
  const [turnstileSuccess, setTurnstileSuccess] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setTurnstileLoading(true);
      try {
        const response = await fetch('/api/admin/settings', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load settings');
        }
        if (mounted) {
          setTurnstile(data.turnstile || emptyTurnstileSettings);
        }
      } catch (err) {
        if (mounted) {
          setTurnstileError(
            err instanceof Error ? err.message : 'Failed to load settings'
          );
        }
      } finally {
        if (mounted) setTurnstileLoading(false);
      }
    }

    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }
    if (!newUsername.trim() && !newPassword) {
      setError('Provide a new username or password');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername.trim() || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update credentials');
      }

      setSuccess('Credentials updated. Redirecting to sign in...');
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push('/admin/signin');
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credentials');
      setLoading(false);
    }
  };

  const handleTurnstileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTurnstileError('');
    setTurnstileSuccess('');
    setTurnstileSaving(true);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile: {
            siteKey: turnstile.siteKey,
            secretKey: turnstileSecretKey || undefined,
            clearSecretKey: clearTurnstileSecretKey,
            requireBrowse: turnstile.requireBrowse,
            requireSearch: turnstile.requireSearch,
            requireAdminLogin: turnstile.requireAdminLogin,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update Turnstile settings');
      }

      setTurnstile(data.turnstile || emptyTurnstileSettings);
      setTurnstileSecretKey('');
      setClearTurnstileSecretKey(false);
      setTurnstileSuccess('Turnstile settings updated');
    } catch (err) {
      setTurnstileError(
        err instanceof Error ? err.message : 'Failed to update Turnstile settings'
      );
    } finally {
      setTurnstileSaving(false);
    }
  };

  const setTurnstileToggle = (
    key: 'requireBrowse' | 'requireSearch' | 'requireAdminLogin',
    value: boolean
  ) => {
    setTurnstile((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <Card className="shadow-sm">
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Account
          </Badge>
          <CardTitle className="text-2xl">Admin settings</CardTitle>
          <CardDescription>
            Change the local admin username or password used for backend
            management.
          </CardDescription>
        </CardHeader>
      </Card>

      {(error || success) && (
        <Card
          className={
            error
              ? 'border-destructive/40 bg-destructive/10 shadow-sm'
              : 'border-primary/30 bg-primary/10 shadow-sm'
          }
        >
          <CardContent
            className={
              error
                ? 'flex items-center gap-2 p-4 text-sm text-destructive'
                : 'flex items-center gap-2 p-4 text-sm text-primary'
            }
          >
            {error ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {error || success}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Credentials</CardTitle>
            <CardDescription>
              Current password verification is required before applying changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="newUsername">New username</Label>
              <Input
                id="newUsername"
                type="text"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="Leave blank to keep current username"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Use 3-64 letters, numbers, dots, dashes, underscores, or @.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Leave blank to keep current password"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update Credentials
            </Button>
          </CardFooter>
        </form>
      </Card>

      {(turnstileError || turnstileSuccess) && (
        <Card
          className={
            turnstileError
              ? 'border-destructive/40 bg-destructive/10 shadow-sm'
              : 'border-primary/30 bg-primary/10 shadow-sm'
          }
        >
          <CardContent
            className={
              turnstileError
                ? 'flex items-center gap-2 p-4 text-sm text-destructive'
                : 'flex items-center gap-2 p-4 text-sm text-primary'
            }
          >
            {turnstileError ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {turnstileError || turnstileSuccess}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <form onSubmit={handleTurnstileSubmit}>
          <CardHeader>
            <Badge variant="secondary" className="mb-2 w-fit gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Turnstile
            </Badge>
            <CardTitle>Bot protection</CardTitle>
            <CardDescription>
              Configure Cloudflare Turnstile and choose which public surfaces
              require verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="turnstileSiteKey">Site key</Label>
              <Input
                id="turnstileSiteKey"
                type="text"
                value={turnstile.siteKey}
                onChange={(event) =>
                  setTurnstile({ ...turnstile, siteKey: event.target.value })
                }
                disabled={turnstileLoading || turnstileSaving}
                placeholder="0x4AAAA..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="turnstileSecretKey">Secret key</Label>
              <Input
                id="turnstileSecretKey"
                type="password"
                value={turnstileSecretKey}
                onChange={(event) => {
                  setTurnstileSecretKey(event.target.value);
                  if (event.target.value) setClearTurnstileSecretKey(false);
                }}
                disabled={turnstileLoading || turnstileSaving}
                placeholder={
                  turnstile.hasSecretKey
                    ? 'Secret key saved; leave blank to keep it'
                    : 'Enter Turnstile secret key'
                }
              />
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {turnstile.hasSecretKey
                    ? 'A secret key is stored encrypted.'
                    : 'No secret key is stored.'}
                </span>
                {turnstile.hasSecretKey && (
                  <Button
                    type="button"
                    variant={clearTurnstileSecretKey ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setClearTurnstileSecretKey(!clearTurnstileSecretKey)
                    }
                    disabled={turnstileLoading || turnstileSaving}
                  >
                    {clearTurnstileSecretKey ? 'Will Clear' : 'Clear Secret'}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="requireBrowse">Browse</Label>
                  <p className="text-sm text-muted-foreground">
                    Require verification before opening the file browser.
                  </p>
                </div>
                <Switch
                  id="requireBrowse"
                  checked={turnstile.requireBrowse}
                  onCheckedChange={(value) =>
                    setTurnstileToggle('requireBrowse', value)
                  }
                  disabled={turnstileLoading || turnstileSaving}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="requireSearch">Search</Label>
                  <p className="text-sm text-muted-foreground">
                    Require verification before searching the index.
                  </p>
                </div>
                <Switch
                  id="requireSearch"
                  checked={turnstile.requireSearch}
                  onCheckedChange={(value) =>
                    setTurnstileToggle('requireSearch', value)
                  }
                  disabled={turnstileLoading || turnstileSaving}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="requireAdminLogin">Admin login</Label>
                  <p className="text-sm text-muted-foreground">
                    Require verification before credentials are accepted.
                  </p>
                </div>
                <Switch
                  id="requireAdminLogin"
                  checked={turnstile.requireAdminLogin}
                  onCheckedChange={(value) =>
                    setTurnstileToggle('requireAdminLogin', value)
                  }
                  disabled={turnstileLoading || turnstileSaving}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={turnstileLoading || turnstileSaving}
              className="w-full"
            >
              {turnstileSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Save Turnstile Settings
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

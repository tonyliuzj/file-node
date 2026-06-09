'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

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

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (newPassword && newPassword.length < 10) {
      setError('New password must be at least 10 characters');
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
                Use 3-64 letters, numbers, dots, dashes, or underscores.
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
    </div>
  );
}

'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import TurnstileWidget from '@/components/turnstile-widget';

type SignInClientProps = {
  turnstileSiteKey: string;
  requireTurnstile: boolean;
};

function SignInForm({ turnstileSiteKey, requireTurnstile }: SignInClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/backends';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (requireTurnstile && !turnstileToken) {
      setError('Complete Turnstile verification before signing in');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        turnstileToken,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid username or password');
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('Sign in failed');
    } finally {
      setTurnstileToken('');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border bg-card">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Admin sign in</CardTitle>
            <CardDescription>
              Access backend and account settings.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isLoading}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
            </div>
            {requireTurnstile && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                disabled={isLoading}
                onVerify={setTurnstileToken}
                onReset={() => setTurnstileToken('')}
              />
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || (requireTurnstile && !turnstileToken)}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SignInFallback() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <Skeleton className="h-11 w-11" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
      </Card>
    </div>
  );
}

export default function SignInClient(props: SignInClientProps) {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm {...props} />
    </Suspense>
  );
}

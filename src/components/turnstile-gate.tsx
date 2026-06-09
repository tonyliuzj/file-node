'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import TurnstileWidget from '@/components/turnstile-widget';
import type { TurnstileArea } from '@/lib/turnstile';

type TurnstileGateProps = {
  area: Exclude<TurnstileArea, 'adminLogin'>;
  siteKey: string;
  title: string;
  description: string;
};

export default function TurnstileGate({
  area,
  siteKey,
  title,
  description,
}: TurnstileGateProps) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback((value: string) => {
    setToken(value);
    setError('');
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('Complete the verification before continuing');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, token }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setToken('');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-3">
          <Badge variant="secondary" className="w-fit gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verification
          </Badge>
          <div>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TurnstileWidget
              siteKey={siteKey}
              disabled={loading}
              onVerify={handleVerify}
              onReset={() => setToken('')}
            />
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

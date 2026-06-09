'use client';

import { type ReactNode, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

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
import { TurnstileClearanceProvider } from '@/components/turnstile-clearance-context';
import type { TurnstileArea } from '@/lib/turnstile';

type TurnstileGateProps = {
  area: Exclude<TurnstileArea, 'adminLogin'>;
  siteKey: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export default function TurnstileGate({
  area,
  siteKey,
  title,
  description,
  children,
}: TurnstileGateProps) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [clearance, setClearance] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback((value: string) => {
    setToken(value);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast.error('Complete the verification before continuing');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, token }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        clearance?: unknown;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      if (children && typeof data.clearance === 'string') {
        setClearance(data.clearance);
        setLoading(false);
        return;
      }

      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
      setToken('');
      setLoading(false);
    }
  };

  if (children && clearance) {
    return (
      <TurnstileClearanceProvider value={clearance}>
        {children}
      </TurnstileClearanceProvider>
    );
  }

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

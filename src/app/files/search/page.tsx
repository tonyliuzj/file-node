import React, { Suspense } from 'react';
import SearchPageClient from './SearchPageClient';
import TurnstileGate from '@/components/turnstile-gate';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getTurnstileSettings, hasTurnstileClearance } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const turnstile = getTurnstileSettings();
  const hasClearance = await hasTurnstileClearance('search');

  if (!hasClearance) {
    return (
      <TurnstileGate
        area="search"
        siteKey={turnstile.siteKey}
        title="Verify to search"
        description="Complete Turnstile verification to access file search."
      />
    );
  }

  return (
    <Suspense fallback={
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    }>
      <SearchPageClient />
    </Suspense>
  );
}

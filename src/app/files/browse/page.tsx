import ExplorerClient from './explorer-client';
import TurnstileGate from '@/components/turnstile-gate';
import { getTurnstileSettings, hasTurnstileClearance } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

export default async function ExplorerPage() {
  const turnstile = getTurnstileSettings();
  const hasClearance = await hasTurnstileClearance('browse');

  if (!hasClearance) {
    if (turnstile.clearanceMinutes === 0) {
      return (
        <TurnstileGate
          area="browse"
          siteKey={turnstile.siteKey}
          title="Verify to browse"
          description="Complete Turnstile verification to access the file browser."
        >
          <ExplorerClient />
        </TurnstileGate>
      );
    }

    return (
      <TurnstileGate
        area="browse"
        siteKey={turnstile.siteKey}
        title="Verify to browse"
        description="Complete Turnstile verification to access the file browser."
      />
    );
  }

  return (
    <ExplorerClient />
  )
}

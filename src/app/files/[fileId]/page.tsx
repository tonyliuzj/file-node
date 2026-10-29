import TurnstileGate from '@/components/turnstile-gate';
import {
  getTurnstileSettings,
  hasTurnstileClearance,
  protectedContentAreas,
} from '@/lib/turnstile';
import ViewerClient from './viewer-client';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ViewerPage({ searchParams }: PageProps) {
  const areas = protectedContentAreas();
  if (areas.length === 0) {
    return <ViewerClient />;
  }

  // Browse and search pass their clearance along in the link, because a clearance that is not
  // remembered lives only in the tab that earned it.
  const params = await searchParams;
  const passed = typeof params.clearance === 'string' ? params.clearance : undefined;
  const cleared = (
    await Promise.all(areas.map((area) => hasTurnstileClearance(area, passed)))
  ).some(Boolean);
  if (cleared) {
    return <ViewerClient />;
  }

  const turnstile = getTurnstileSettings();
  const gateProps = {
    area: areas[0],
    siteKey: turnstile.siteKey,
    title: 'Verify to open files',
    description: 'Complete Turnstile verification to view or download files.',
  };

  // With remembered clearances the cookie is set and the page refreshes; otherwise the clearance
  // is handed straight to the viewer.
  return turnstile.clearanceMinutes === 0 ? (
    <TurnstileGate {...gateProps}>
      <ViewerClient />
    </TurnstileGate>
  ) : (
    <TurnstileGate {...gateProps} />
  );
}

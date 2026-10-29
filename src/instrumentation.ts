export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // First, so every request the server handles carries the real socket address.
    const { installPeerAddressHook } = await import('./lib/peer-address');
    const { trustsProxy } = await import('./lib/rate-limit');
    installPeerAddressHook();
    console.log(
      trustsProxy()
        ? 'Client addresses: taken from reverse-proxy headers (FILE_NODE_TRUST_PROXY=1).'
        : 'Client addresses: taken from the connection itself; clients behind a private network or NAT share one limit.'
    );

    const cron = await import('node-cron');
    const { scanAllDue } = await import('./utils/scanner');

    console.log('Starting background scanner...');
    
    // Initial check
    scanAllDue().catch(console.error);

    // Schedule check every minute
    cron.schedule('* * * * *', () => {
      scanAllDue().catch(console.error);
    });
  }
}

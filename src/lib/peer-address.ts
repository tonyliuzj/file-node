import http from 'node:http';
import { PEER_HEADER } from '@/lib/rate-limit';

/**
 * Stamps the real socket address on every incoming request, under a header name that is
 * overwritten (never trusted) if the client sends it. Route handlers cannot see the socket, and
 * Next only fills X-Forwarded-For when the client left it out, so without this a direct client
 * could not be told apart from one spoofing that header.
 *
 * Fails open: if anything goes wrong the header is simply absent and callers fall back to the
 * shared "direct" client.
 */
export function installPeerAddressHook() {
  const state = globalThis as { __fileNodePeerHook?: boolean };
  if (state.__fileNodePeerHook) return;

  const proto = http.Server.prototype as unknown as {
    emit: (...args: unknown[]) => boolean;
  };
  const originalEmit = proto.emit;

  proto.emit = function patchedEmit(this: unknown, ...args: unknown[]) {
    if (args[0] === 'request') {
      try {
        const request = args[1] as http.IncomingMessage;
        delete request.headers[PEER_HEADER];
        const peer = request.socket?.remoteAddress;
        if (peer) request.headers[PEER_HEADER] = peer;
      } catch {
        // leave the request untouched
      }
    }
    return originalEmit.apply(this, args);
  };

  state.__fileNodePeerHook = true;
}

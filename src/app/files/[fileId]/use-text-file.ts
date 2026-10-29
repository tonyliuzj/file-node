'use client';

import { useEffect, useState } from 'react';

// Previews are rendered in the browser tab, so a huge log or dump must not be pulled in whole.
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export type TextFileState =
  | { status: 'loading' }
  | { status: 'ready'; text: string; truncated: boolean }
  | { status: 'error'; message: string };

/**
 * Streams a text file and stops reading once `maxBytes` have arrived. The request is cancelled if
 * the viewer is closed first.
 */
export function useTextFile(url: string, maxBytes = MAX_PREVIEW_BYTES): TextFileState {
  const [state, setState] = useState<TextFileState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`The server answered ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          const text = await response.text();
          setState({
            status: 'ready',
            text: text.slice(0, maxBytes),
            truncated: text.length > maxBytes,
          });
          return;
        }

        const decoder = new TextDecoder('utf-8');
        let text = '';
        let received = 0;
        let truncated = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          received += value.length;
          if (received > maxBytes) {
            const keep = value.length - (received - maxBytes);
            text += decoder.decode(value.subarray(0, keep), { stream: true });
            truncated = true;
            await reader.cancel();
            break;
          }
          text += decoder.decode(value, { stream: true });
        }

        text += decoder.decode();
        setState({ status: 'ready', text, truncated });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load the file',
        });
      }
    }

    load();
    return () => controller.abort();
  }, [url, maxBytes]);

  return state;
}

export function formatPreviewLimit(bytes = MAX_PREVIEW_BYTES) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

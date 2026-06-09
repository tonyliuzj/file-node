'use client';

import { useEffect, useId, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        selector: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'auto' | 'light' | 'dark';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type TurnstileWidgetProps = {
  siteKey: string;
  disabled?: boolean;
  onVerify: (token: string) => void;
  onReset?: () => void;
};

export default function TurnstileWidget({
  siteKey,
  disabled,
  onVerify,
  onReset,
}: TurnstileWidgetProps) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `turnstile-${reactId}`;
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onResetRef = useRef(onReset);
  const wasDisabledRef = useRef(disabled);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onResetRef.current = onReset;
  }, [onReset, onVerify]);

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || widgetIdRef.current) return;
        const container = document.getElementById(containerId);
        if (!container) return;

        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => onVerifyRef.current(token),
          'expired-callback': () => {
            onResetRef.current?.();
          },
          'error-callback': () => {
            onResetRef.current?.();
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [containerId, siteKey]);

  useEffect(() => {
    if (wasDisabledRef.current && !disabled && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onResetRef.current?.();
    }
    wasDisabledRef.current = disabled;
  }, [disabled]);

  return (
    <div className="space-y-2">
      <div id={containerId} className="min-h-[65px]" />
      {loadError && (
        <p className="text-sm text-destructive">
          Unable to load Turnstile verification.
        </p>
      )}
    </div>
  );
}

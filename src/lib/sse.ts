import { API_BASE_URL } from './api-client';

/**
 * Shared live-order SSE connection helper, used by both `Orders.tsx` and
 * `WhatsAppPauseBanner.tsx` so the URL-building and reconnect logic can't
 * drift between the two call sites (see KNOWN_BUGS.md BUG-0002/BUG-0027).
 *
 * The backend route (`GET /v1/business/orders/live/stream`,
 * backend/app/realtime/sse.py) must be reached at the API host, not the
 * dashboard's own origin — a relative EventSource URL resolves against
 * whatever origin the SPA is served from, which 404s/returns HTML in
 * production. It emits three NAMED events — `connected`, `keepalive`,
 * `order_update` — never the unnamed default `message` event, so this must
 * use addEventListener for each rather than `onmessage`.
 */
const SSE_MAX_RETRIES = 5;
const SSE_BASE_DELAY_MS = 1000;
const SSE_MAX_DELAY_MS = 30000;

export interface OrderStreamHandle {
  close: () => void;
}

function getStoredToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

/**
 * Opens (and, on transient failure, reconnects to) the live order stream.
 * `onOrderUpdate` is called with the parsed JSON payload of every
 * `order_update` event. `onGiveUp` fires once after retries are exhausted,
 * so callers can rely on their existing polling as the fallback instead of
 * the browser hammering a dead connection forever.
 *
 * Always call `.close()` on unmount (or when the caller knows the session
 * ended) to stop any pending reconnect timer and close the underlying
 * EventSource.
 */
export function createOrderStream(
  onOrderUpdate: (data: unknown) => void,
  onGiveUp?: () => void
): OrderStreamHandle {
  let es: EventSource | null = null;
  let retries = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function open() {
    if (stopped) return;
    const token = getStoredToken();
    if (!token) return;

    const url = `${API_BASE_URL}/v1/business/orders/live/stream?token=${encodeURIComponent(token)}`;

    try {
      es = new EventSource(url);
    } catch {
      onGiveUp?.();
      return;
    }

    es.addEventListener('connected', () => {
      retries = 0; // reset back-off — proof the connection is alive
    });

    es.addEventListener('keepalive', () => {
      retries = 0; // periodic proof of life — keep the back-off reset
    });

    es.addEventListener('order_update', (event: MessageEvent) => {
      retries = 0;
      try {
        onOrderUpdate(JSON.parse(event.data));
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      es?.close();
      es = null;
      if (stopped) return;

      if (retries >= SSE_MAX_RETRIES) {
        onGiveUp?.();
        return;
      }

      const delay = Math.min(SSE_BASE_DELAY_MS * 2 ** retries, SSE_MAX_DELAY_MS);
      retries += 1;
      retryTimer = setTimeout(open, delay);
    };
  }

  open();

  return {
    close() {
      stopped = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
      es = null;
    },
  };
}

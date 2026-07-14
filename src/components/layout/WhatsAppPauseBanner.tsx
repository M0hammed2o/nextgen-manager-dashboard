import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { WhatsAppStatus } from '@/types/api';
import { PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Persistent "WhatsApp ordering paused" banner — lives in DashboardLayout so
 * it's visible on every page, not just Orders. Subscribes to the same SSE
 * stream/channel as order alerts (backend publishes whatsapp_paused /
 * whatsapp_resumed events alongside order events), same pattern as the
 * already-correct SSE listener in Orders.tsx.
 */
export function WhatsAppPauseBanner() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [resuming, setResuming] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    apiClient
      .get<WhatsAppStatus>('/v1/business/whatsapp/status')
      .then(setStatus)
      .catch(() => {
        // Non-fatal — banner just won't show until the next SSE event.
      });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    const url = `/v1/business/orders/live/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.addEventListener('order_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'whatsapp_paused') {
          setStatus({
            paused: true,
            paused_at: data.at ?? null,
            paused_by_name: data.paused_by_name ?? null,
            busy_text: null,
          });
        } else if (data.type === 'whatsapp_resumed') {
          setStatus((prev) => ({
            paused: false,
            paused_at: null,
            paused_by_name: null,
            busy_text: prev?.busy_text ?? null,
          }));
        }
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, []);

  const handleResume = async () => {
    setResuming(true);
    try {
      const res = await apiClient.post<WhatsAppStatus>('/v1/business/whatsapp/resume');
      setStatus(res);
    } finally {
      setResuming(false);
    }
  };

  if (!status?.paused) return null;

  const pausedTime = status.paused_at
    ? new Date(status.paused_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm md:px-6">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <PauseCircle className="h-4 w-4 shrink-0" />
        <span>
          WhatsApp ordering paused
          {status.paused_by_name ? ` by ${status.paused_by_name}` : ''}
          {pausedTime ? ` at ${pausedTime}` : ''} — customers are seeing your busy message.
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={handleResume} disabled={resuming}>
        {resuming ? '…' : 'Resume'}
      </Button>
    </div>
  );
}

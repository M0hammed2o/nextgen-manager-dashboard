import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { createOrderStream } from '@/lib/sse';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import type { WhatsAppStatus } from '@/types/api';
import { PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Persistent "WhatsApp ordering paused" banner — lives in DashboardLayout so
 * it's visible on every page, not just Orders. Subscribes to the same SSE
 * stream/channel as order alerts (backend publishes whatsapp_paused /
 * whatsapp_resumed events alongside order events), via the shared
 * `createOrderStream` helper so the URL-building/reconnect logic can't
 * drift from `Orders.tsx`'s copy (see KNOWN_BUGS.md BUG-0002).
 *
 * Hidden entirely for a POS-only tenant (`is_whatsapp_enabled === false`) —
 * a WhatsApp pause/resume control makes no sense when the channel itself is
 * switched off for this business.
 */
export function WhatsAppPauseBanner() {
  const { data: settings } = useBusinessSettings();
  const whatsappEnabled = settings?.is_whatsapp_enabled ?? true;
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!whatsappEnabled) return;
    apiClient
      .get<WhatsAppStatus>('/v1/business/whatsapp/status')
      .then(setStatus)
      .catch(() => {
        // Non-fatal — banner just won't show until the next SSE event.
      });
  }, [whatsappEnabled]);

  useEffect(() => {
    if (!whatsappEnabled) return;
    const handle = createOrderStream((data: any) => {
      if (data?.type === 'whatsapp_paused') {
        setStatus({
          paused: true,
          paused_at: data.at ?? null,
          paused_by_name: data.paused_by_name ?? null,
          busy_text: null,
        });
      } else if (data?.type === 'whatsapp_resumed') {
        setStatus((prev) => ({
          paused: false,
          paused_at: null,
          paused_by_name: null,
          busy_text: prev?.busy_text ?? null,
        }));
      }
    });

    return () => handle.close();
  }, [whatsappEnabled]);

  const handleResume = async () => {
    setResuming(true);
    try {
      const res = await apiClient.post<WhatsAppStatus>('/v1/business/whatsapp/resume');
      setStatus(res);
    } finally {
      setResuming(false);
    }
  };

  if (!whatsappEnabled) return null;
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

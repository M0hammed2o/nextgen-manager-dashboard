import { AlertTriangle, CheckCircle2, Lock, Wrench } from 'lucide-react';
import type { AccessLevel } from '@/lib/souk';
import { describeAccessReason } from '@/lib/souk';
import { cn } from '@/lib/utils';

/**
 * The event vendor's current access level (GET /v1/business/event-access):
 * CONFIGURE = set-up mode, TRADE = selling open today, NONE = closed.
 * The backend decides the level; this only explains it.
 */
export function EventAccessBanner({ level, reason }: { level: AccessLevel | null; reason: string | null }) {
  if (!level) return null;

  const config = {
    CONFIGURE: {
      icon: <Wrench className="h-5 w-5 flex-none" />,
      title: 'Set-up mode',
      text: 'You can prepare everything now. Selling opens on your paid days.',
      tone: 'border-warning/40 bg-warning/10',
    },
    TRADE: {
      icon: <CheckCircle2 className="h-5 w-5 flex-none text-success" />,
      title: 'Trading open today',
      text: 'Your till is open. Good selling!',
      tone: 'border-success/40 bg-success/10',
    },
    NONE: {
      icon: <Lock className="h-5 w-5 flex-none text-muted-foreground" />,
      title: 'Not open right now',
      text: 'Set-up and selling are both closed at the moment. See below for why.',
      tone: 'border-border bg-muted/50',
    },
  }[level];

  if (!config) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border p-4 text-sm">
        <AlertTriangle className="h-5 w-5 flex-none" /> Unknown access state.
      </div>
    );
  }

  const why = describeAccessReason(reason);
  return (
    <div role="status" data-testid="event-access-banner" data-level={level}
      className={cn('flex items-start gap-3 rounded-lg border p-4', config.tone)}>
      {config.icon}
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{config.title}</p>
        <p>{config.text}</p>
        {why && <p className="mt-1 text-muted-foreground">{why}</p>}
      </div>
    </div>
  );
}

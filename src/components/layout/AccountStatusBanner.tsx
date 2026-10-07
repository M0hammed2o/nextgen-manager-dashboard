import { useEffect, useState } from 'react';
import { useAccountStatus } from '@/hooks/use-account-status';
import { buildAccountBanner, isDismissedToday, dismissToday, isBannerDismissed } from '@/lib/account-alerts';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SEVERITY_CLASSES: Record<string, string> = {
  info: 'border-border bg-muted text-foreground',
  amber: 'border-warning/30 bg-warning/10 text-warning dark:text-warning',
  red: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/**
 * Persistent trial/invoice status banner — lives in DashboardLayout next to
 * `WhatsAppPauseBanner` so it's visible to OWNER and MANAGER on every page.
 * Driven by `GET /v1/business/billing/account`; see `lib/account-alerts.ts`
 * for the alert -> severity/copy mapping (including why SUSPENDED is
 * deliberately never rendered here).
 *
 * If the account-status fetch fails for any reason, this renders nothing —
 * a billing-status glitch must never block the rest of the dashboard.
 */
export function AccountStatusBanner() {
  const { data, isError } = useAccountStatus();
  const banner = data ? buildAccountBanner(data) : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(banner?.dismissible ? isDismissedToday(banner.code) : false);
  }, [banner?.code, banner?.dismissible]);

  if (isError || !data || !banner) return null;
  if (isBannerDismissed(banner, dismissed)) return null;

  const classes = SEVERITY_CLASSES[banner.severity] ?? SEVERITY_CLASSES.info;
  const Icon = banner.severity === 'info' ? Info : AlertTriangle;

  return (
    <div className={`flex items-start justify-between gap-3 border-b px-4 py-2 text-sm md:px-6 ${classes}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{banner.message}</span>
      </div>
      {banner.dismissible && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 h-6 w-6 p-0"
          onClick={() => {
            dismissToday(banner.code);
            setDismissed(true);
          }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

import { Badge, type BadgeProps } from '@/components/ui/badge';

type StatusVariant = NonNullable<BadgeProps['variant']>;

interface StatusBadgeProps {
  label: string;
  variant: StatusVariant;
  className?: string;
}

/**
 * Thin, named wrapper around the shadcn `Badge` for status pills
 * specifically (connection status, billing status, reward tier, etc.).
 *
 * This does NOT change how any badge looks — every call site still owns its
 * own `Record<Status, variant>` map (the value sets genuinely differ per
 * domain: order status vs. billing status vs. WhatsApp connection status).
 * What it gives the app is one discoverable, named place for "this is the
 * app's status-pill pattern" instead of every page reaching for the raw
 * `Badge` component and re-deriving the same look. New status pills should
 * prefer this import; existing call sites are not being churned just to
 * adopt it (see WORKLOG.md for the day this was introduced).
 */
export function StatusBadge({ label, variant, className }: StatusBadgeProps) {
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

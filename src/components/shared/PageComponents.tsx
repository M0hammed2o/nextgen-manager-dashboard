import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, CircleAlert, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  /** Human-readable message; falls back to a generic sentence if omitted. */
  message?: string;
  onRetry: () => void;
  /** True while a retry is in flight, to disable/label the button. */
  isRetrying?: boolean;
}

/**
 * Distinct-from-empty error state with a Retry action, for a data-driven
 * page whose initial load failed. Never render the "no data" EmptyState for
 * a genuine fetch failure — an owner needs to be able to tell "nothing here
 * yet" apart from "something is broken" (see KNOWN_BUGS.md, Orders page
 * silent-failure fix).
 */
export function ErrorState({ message, onRetry, isRetrying }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-destructive mb-4"><AlertTriangle className="w-12 h-12" /></div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Couldn't load this page</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {message || 'Something went wrong talking to the server. Check your connection and try again.'}
      </p>
      <Button onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

interface InlineErrorBannerProps {
  message?: string;
  onRetry: () => void;
}

/**
 * Compact banner for when a page already has data on screen (from a
 * previous successful load) but the latest background refetch failed —
 * keeps the stale data visible instead of replacing it with a full-page
 * ErrorState, while still telling the user the data may be out of date.
 */
export function InlineErrorBanner({ message, onRetry }: InlineErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{message || "Couldn't refresh — showing the last loaded data."}</span>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}

export function StatCard({ label, value, icon, subtitle }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="shrink-0 text-muted-foreground">{icon}</div>
      </div>
      {/* Tabular figures so a column of money and counts lines up, and a
          tighter size on phone so four metrics fit above the fold -- E4 asks
          an owner to read restaurant health in five to ten seconds, which a
          one-per-screen card cannot deliver. */}
      <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}


// ── UI V2 shared page furniture ──────────────────────────────────────────────
//
// Every one of this dashboard's 30 pages previously rolled its own header
// markup (`<h1 className="text-2xl font-bold">` plus an optional paragraph),
// which is why spacing and type drifted between them. These three components
// are the smallest set that makes the surfaces consistent WITHOUT touching any
// page's data fetching or business logic.

interface PageHeaderProps {
  /** ReactNode, not string: several pages interpolate live values into their
      title or subtitle (item counts, the business name, a period label), and
      those must survive adoption of this component unchanged. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary/secondary actions, right-aligned on desktop, wrapped on phone. */
  actions?: React.ReactNode;
}

/**
 * The single page header for the dashboard.
 *
 * Wraps rather than truncates on a phone: a manager needs the action, and a
 * header that pushes its own button off-screen is worse than one that is two
 * lines tall.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Responsive wrapper for a wide data table.
 *
 * A dashboard table with six or more columns cannot shrink to 390px without
 * becoming unreadable, and letting it overflow the PAGE makes the whole
 * layout scroll sideways -- which is the single worst mobile failure because
 * it breaks every other element too. This confines the scrolling to the table
 * itself and keeps the page still.
 */
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-1 overflow-x-auto px-1', className)}>
      <div className="min-w-[640px]">{children}</div>
    </div>
  );
}

export type StockStatus = 'HEALTHY' | 'LOW' | 'CRITICAL';

const STATUS_META: Record<StockStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  HEALTHY: { label: 'Healthy', cls: 'bg-success/10 text-success', Icon: CheckCircle2 },
  LOW: { label: 'Low', cls: 'bg-warning/15 text-warning', Icon: CircleAlert },
  CRITICAL: { label: 'Critical', cls: 'bg-destructive/10 text-destructive', Icon: CircleX },
};

/**
 * Stock status as ICON + TEXT + colour, never colour alone.
 *
 * Roughly one man in twelve has some form of colour-vision deficiency, and a
 * red/amber/green dot is exactly the pattern they cannot read. The word is the
 * primary signal here; the icon gives a second non-colour cue; the colour is
 * third. The palette is the NextGen semantic set, so these never follow a
 * restaurant's brand -- "Critical" must look the same in every restaurant.
 */
export function StockStatusPill({ status, className }: { status: StockStatus; className?: string }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        cls,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

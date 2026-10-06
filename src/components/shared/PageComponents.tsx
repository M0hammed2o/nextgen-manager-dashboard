import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

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

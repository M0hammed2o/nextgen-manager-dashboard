import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Lock, Store, Bike, ShoppingBag, Sigma } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatCents } from '@/lib/mappers';
import { isAdvancedAnalyticsNotEnabledError } from '@/lib/entitlements';
import type {
  SalesWallet, SalesWalletAvailability, SalesWalletKey, SalesWalletOrdersResponse,
  SalesWalletRange, SalesWalletsReport, SalesWalletTotals,
} from '@/types/api';
import { StatCard, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Sales Wallets are REPORTING views of sales by channel. They are not stored
// money: no balance, no withdrawal, no payout. The backend scopes everything
// by the JWT, so no business id is ever sent from here.

const RANGES: { value: SalesWalletRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

const PAGE_SIZE = 25;

const CARD_ICONS: Record<string, React.ReactNode> = {
  MR_D: <Store className="w-5 h-5" />,
  UBER_EATS: <Bike className="w-5 h-5" />,
  GENERAL: <ShoppingBag className="w-5 h-5" />,
  TOTAL: <Sigma className="w-5 h-5" />,
};

function humanise(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/** Sale time in the business timezone (falls back to the browser's if the zone is unusable). */
function formatSaleTime(iso: string, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Date(iso).toLocaleString('en-US', { ...opts, timeZone });
  } catch {
    try {
      return new Date(iso).toLocaleString('en-US', opts);
    } catch {
      return '—';
    }
  }
}

function buildQuery(range: SalesWalletRange, start: string, end: string, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('start', start);
    params.set('end', end);
  }
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

/** Muted note for fees/settlement. Renders nothing for null (not applicable). Never renders a number when unavailable. */
function AvailabilityNote({ label, info }: { label: string; info: SalesWalletAvailability | null | undefined }) {
  if (!info || info.available) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {label}: not available{info.reason ? `, ${info.reason}` : ''}
    </p>
  );
}

function WalletCard({ wallet, onOpen }: { wallet: SalesWallet | SalesWalletTotals; onOpen: () => void }) {
  const w = wallet as SalesWallet;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${wallet.label} breakdown`}
      className="text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StatCard
        label={wallet.label}
        value={formatCents(wallet.net_cents)}
        icon={CARD_ICONS[wallet.key] ?? <Sigma className="w-5 h-5" />}
        subtitle={`Net sales · ${wallet.order_count} order${wallet.order_count === 1 ? '' : 's'}`}
      />
      <div className="mt-1 px-1 space-y-0.5 text-xs text-muted-foreground">
        <p>Gross {formatCents(wallet.gross_cents)} · Refunds {formatCents(wallet.refunds_cents)}</p>
        <AvailabilityNote label="Platform fees" info={w.platform_fees} />
      </div>
    </button>
  );
}

function StatusCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No payments in this period.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([status, n]) => (
        <Badge key={status} variant="secondary">{humanise(status)}: {n}</Badge>
      ))}
    </div>
  );
}

function WalletBreakdownSheet({
  wallet, label, range, start, end, onClose,
}: {
  wallet: SalesWalletKey | null; label: string; range: SalesWalletRange; start: string; end: string; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageWallet, setPageWallet] = useState<string | null>(null);
  // Reset to page 1 whenever a different wallet is opened.
  if (wallet !== pageWallet) {
    setPageWallet(wallet);
    setPage(1);
  }

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['sales-wallet-orders', wallet, range, range === 'custom' ? start : null, range === 'custom' ? end : null, page],
    queryFn: () => apiClient.get<SalesWalletOrdersResponse>(
      `/v1/business/analytics/sales-wallets/${wallet}/orders?${buildQuery(range, start, end, { page, page_size: PAGE_SIZE })}`,
    ),
    enabled: wallet !== null,
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / data.page_size)) : 1;
  const summary = data?.summary;

  return (
    <Sheet open={wallet !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{data?.label ?? label}</SheetTitle>
          <SheetDescription>
            {data ? `${data.start_date} to ${data.end_date} (${data.timezone}). ` : ''}Reporting only, not money held.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : isAdvancedAnalyticsNotEnabledError(error) ? (
            <EmptyState
              icon={<Lock className="w-8 h-8" />}
              title="Not enabled"
              description="Advanced Analytics isn't enabled for your account."
            />
          ) : isError || !data || !summary ? (
            <ErrorState
              message={(error as Error | null)?.message ?? "Couldn't load this breakdown."}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Gross sales" value={formatCents(summary.gross_cents)} icon={<Sigma className="w-4 h-4" />} />
                <StatCard label="Refunds" value={formatCents(summary.refunds_cents)} icon={<Sigma className="w-4 h-4" />} />
                <StatCard label="Net sales" value={formatCents(summary.net_cents)} icon={<Sigma className="w-4 h-4" />} />
                <StatCard label="Orders" value={summary.order_count} icon={<Sigma className="w-4 h-4" />} />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Payment status</h3>
                <StatusCounts counts={summary.payment_status_counts} />
                {summary.voided_count > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Voided: {summary.voided_count} order{summary.voided_count === 1 ? '' : 's'} ({formatCents(summary.voided_cents)})
                  </p>
                )}
                <AvailabilityNote label="Platform fees" info={summary.platform_fees} />
                <AvailabilityNote label="Settlement" info={summary.settlement} />
              </div>

              {data.by_source.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">By source</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Refunds</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_source.map((s) => (
                        <TableRow key={s.source}>
                          <TableCell className="font-medium">{s.label}</TableCell>
                          <TableCell className="text-right">{s.order_count}</TableCell>
                          <TableCell className="text-right">{formatCents(s.gross_cents)}</TableCell>
                          <TableCell className="text-right">{formatCents(s.refunds_cents)}</TableCell>
                          <TableCell className="text-right">{formatCents(s.net_cents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Orders</h3>
                {data.orders.length === 0 ? (
                  <EmptyState
                    icon={<ShoppingBag className="w-8 h-8" />}
                    title="No orders in this period"
                    description="Orders for this channel will appear here once they come in."
                  />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[560px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">Refund</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.orders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell>
                                <div className="font-medium">{o.order_number}</div>
                                <div className="text-xs text-muted-foreground">{o.source_label} · {humanise(o.status)}</div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{formatSaleTime(o.sale_at, data.timezone)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{humanise(o.payment_status)}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{formatCents(o.gross_cents)}</TableCell>
                              <TableCell className="text-right">{formatCents(o.refund_cents)}</TableCell>
                              <TableCell className="text-right">{formatCents(o.net_cents)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        Page {data.page} of {totalPages} · {data.total_count} order{data.total_count === 1 ? '' : 's'}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                          Previous
                        </Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SalesWalletsSection({ entitled }: { entitled: boolean }) {
  const [range, setRange] = useState<SalesWalletRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [openWallet, setOpenWallet] = useState<{ key: SalesWalletKey; label: string } | null>(null);

  const customReady = range !== 'custom' || (customStart !== '' && customEnd !== '' && customStart <= customEnd);
  const customOrderInvalid = range === 'custom' && customStart !== '' && customEnd !== '' && customStart > customEnd;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['sales-wallets', range, range === 'custom' ? customStart : null, range === 'custom' ? customEnd : null],
    queryFn: () => apiClient.get<SalesWalletsReport>(
      `/v1/business/analytics/sales-wallets?${buildQuery(range, customStart, customEnd)}`,
    ),
    enabled: entitled && customReady,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sales Wallets</h2>
        <p className="text-sm text-muted-foreground">Sales by channel. Reporting only, not money held.</p>
      </div>

      {!entitled ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <EmptyState
            icon={<Lock className="w-10 h-10" />}
            title="Sales Wallets aren't available on your plan"
            description="Sales by channel (Mr D Food, Uber Eats and direct sales) is part of the NextGen Complete plan. Contact NextGen to add this module."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {RANGES.map((r) => (
              <Button key={r.value} variant={range === r.value ? 'default' : 'outline'} size="sm" onClick={() => setRange(r.value)}>
                {r.label}
              </Button>
            ))}
            {range === 'custom' && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sales-wallets-start" className="text-xs">Start date</Label>
                  <Input id="sales-wallets-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sales-wallets-end" className="text-xs">End date</Label>
                  <Input id="sales-wallets-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {!customReady ? (
            <p className="text-sm text-muted-foreground">
              {customOrderInvalid ? 'The end date must be on or after the start date.' : 'Choose a start and end date to see sales.'}
            </p>
          ) : isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ) : isAdvancedAnalyticsNotEnabledError(error) ? (
            <div className="bg-card border border-border rounded-xl p-6">
              <EmptyState
                icon={<Lock className="w-8 h-8" />}
                title="Not enabled"
                description="Advanced Analytics isn't enabled for your account."
              />
            </div>
          ) : isError || !data ? (
            <ErrorState
              message={(error as Error | null)?.message ?? "Couldn't load sales by channel."}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.wallets.map((w) => (
                  <WalletCard key={w.key} wallet={w} onOpen={() => setOpenWallet({ key: w.key as SalesWalletKey, label: w.label })} />
                ))}
                {/* Total is the API's own figure, never recomputed from the cards. */}
                <WalletCard wallet={data.total} onOpen={() => setOpenWallet({ key: 'TOTAL', label: data.total.label })} />
              </div>
              <p className="text-xs text-muted-foreground">
                {data.start_date} to {data.end_date} ({data.timezone}). Click a card for the order breakdown.
              </p>
            </>
          )}
        </>
      )}

      <WalletBreakdownSheet
        wallet={openWallet?.key ?? null}
        label={openWallet?.label ?? ''}
        range={range}
        start={customStart}
        end={customEnd}
        onClose={() => setOpenWallet(null)}
      />
    </div>
  );
}

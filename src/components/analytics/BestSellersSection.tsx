import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, Info, PackageSearch } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatCents } from '@/lib/mappers';
import type { BestSellerChannel, BestSellerRankBy, BestSellerRow, BestSellersReport } from '@/types/api';
import { ErrorState } from '@/components/shared/PageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DateRangeControl, buildQuery, useDateRange } from '@/components/analytics/DateRangeControl';
import { ProductPerformanceSheet } from '@/components/analytics/ProductPerformanceSheet';
import { ProductImage, formatPct, ordinal } from '@/components/analytics/product-bits';

// Top 3 products per sales channel. Reporting only. The backend scopes
// everything by the JWT, so no business id is ever sent from here.

const REFUND_TITLE =
  "A partial refund on an order can't be attributed to a single product, so a refund-adjusted figure isn't available for this one.";

function RankRow({ row, rankBy, onOpen }: { row: BestSellerRow; rankBy: BestSellerRankBy; onOpen: () => void }) {
  const share = rankBy === 'quantity' ? row.quantity_share_pct : row.revenue_share_pct;
  const shareLabel = rankBy === 'quantity' ? '% of channel units' : '% of channel item sales';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Compare ${row.name} across channels`}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="w-9 shrink-0 text-sm font-semibold text-muted-foreground">{ordinal(row.rank)}</span>
        <ProductImage url={row.image_url} name={row.name} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">
            {row.name}
            {row.is_deleted && <span className="ml-2 text-xs font-normal text-muted-foreground">(removed)</span>}
          </span>
          <span className="block text-xs text-muted-foreground">
            {row.quantity} sold · {formatCents(row.gross_cents)} gross
          </span>
          <span className="block text-xs text-muted-foreground">
            Refund-adjusted{' '}
            {row.refund_adjusted_cents === null ? (
              <span title={REFUND_TITLE} aria-label={`Not available. ${REFUND_TITLE}`} className="cursor-help">—</span>
            ) : (
              formatCents(row.refund_adjusted_cents)
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-foreground">{formatPct(share)}</span>
          <span className="block text-[11px] text-muted-foreground">{shareLabel}</span>
        </span>
      </button>
    </li>
  );
}

function ChannelCard({
  channel, rankBy, onOpenProduct,
}: {
  channel: BestSellerChannel; rankBy: BestSellerRankBy; onOpenProduct: (row: BestSellerRow) => void;
}) {
  const { unmapped, unattributed_refunds: refunds, awaiting_mapping_orders: awaiting } = channel;
  return (
    <section aria-label={`${channel.label} best sellers`} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-foreground">{channel.label}</h3>
        <p className="text-xs text-muted-foreground">
          {channel.total_quantity} unit{channel.total_quantity === 1 ? '' : 's'} · {formatCents(channel.total_item_gross_cents)} item sales
        </p>
      </div>

      {channel.ranking.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <PackageSearch className="h-7 w-7" />
          <p className="text-sm">No sales in this period</p>
        </div>
      ) : (
        <ol className="space-y-1">
          {channel.ranking.map((row) => (
            <RankRow key={row.menu_item_id} row={row} rankBy={rankBy} onOpen={() => onOpenProduct(row)} />
          ))}
        </ol>
      )}

      {awaiting > 0 && (
        <p role="alert" className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {awaiting} order{awaiting === 1 ? '' : 's'} waiting for menu mapping {awaiting === 1 ? 'is' : 'are'} not included.
          </span>
        </p>
      )}
      {unmapped.quantity > 0 && (
        <p role="alert" className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {unmapped.quantity} unit{unmapped.quantity === 1 ? '' : 's'} ({formatCents(unmapped.gross_cents)}) with no matching product
            {' '}can&apos;t be ranked
            {unmapped.names.length > 0 ? `: ${unmapped.names.join(', ')}` : ''}.
          </span>
        </p>
      )}
      {refunds.order_count > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {refunds.order_count} refunded order{refunds.order_count === 1 ? '' : 's'} ({formatCents(refunds.refunds_cents)}) can&apos;t be
            attributed to a single product.
          </span>
        </p>
      )}
    </section>
  );
}

export function BestSellersSection() {
  const dateRange = useDateRange('today');
  const { range, start, end, customReady, customOrderInvalid } = dateRange;
  const [rankBy, setRankBy] = useState<BestSellerRankBy>('quantity');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['best-sellers', range, range === 'custom' ? start : null, range === 'custom' ? end : null, rankBy],
    queryFn: () => apiClient.get<BestSellersReport>(
      `/v1/business/analytics/best-sellers?${buildQuery(range, start, end, { rank_by: rankBy })}`,
    ),
    enabled: customReady,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Best-selling products</h2>
        <p className="text-sm text-muted-foreground">Top 3 products per sales channel. Reporting only.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangeControl state={dateRange} idPrefix="best-sellers" />
        <div className="flex items-center gap-2" role="group" aria-label="Rank by">
          <span className="text-sm text-muted-foreground">Rank by:</span>
          {([['quantity', 'Quantity'], ['revenue', 'Revenue']] as const).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={rankBy === value ? 'default' : 'outline'}
              aria-pressed={rankBy === value}
              onClick={() => setRankBy(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {!customReady ? (
        <p className="text-sm text-muted-foreground">
          {customOrderInvalid ? 'The end date must be on or after the start date.' : 'Choose a start and end date to see best sellers.'}
        </p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="best-sellers-loading">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : isError || !data ? (
        <ErrorState
          message={(error as Error | null)?.message ?? "Couldn't load best-selling products."}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <>
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${isFetching ? 'opacity-70' : ''}`}>
            {data.channels.map((c) => (
              <ChannelCard
                key={c.key}
                channel={c}
                rankBy={data.rank_by ?? rankBy}
                onOpenProduct={(row) => setSelected({ id: row.menu_item_id, name: row.name })}
              />
            ))}
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{data.start_date} to {data.end_date} ({data.timezone}). Click a product to compare it across channels.</p>
            {data.share_basis && <p>{data.share_basis}</p>}
            {data.refund_basis && <p>{data.refund_basis}</p>}
          </div>
        </>
      )}

      <ProductPerformanceSheet
        product={selected}
        range={range}
        start={start}
        end={end}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

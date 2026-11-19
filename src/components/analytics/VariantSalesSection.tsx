import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCents } from '@/lib/mappers';
import type { VariantSalesReport } from '@/lib/variants';
import { ErrorState } from '@/components/shared/PageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangeControl, buildQuery, useDateRange } from '@/components/analytics/DateRangeControl';

// Units sold / returned / net per product variant. Reporting only; the
// backend scopes everything by the JWT.

export function VariantSalesSection() {
  const dateRange = useDateRange('7d');
  const { range, start, end, customReady, customOrderInvalid } = dateRange;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['variant-sales', range, range === 'custom' ? start : null, range === 'custom' ? end : null],
    queryFn: () => apiClient.get<VariantSalesReport>(`/v1/business/analytics/variants?${buildQuery(range, start, end)}`),
    enabled: customReady,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Variant sales</h2>
        <p className="text-sm text-muted-foreground">Units sold, returned and net revenue per size, colour and SKU.</p>
      </div>
      <DateRangeControl state={dateRange} idPrefix="variant-sales" />

      {!customReady ? (
        <p className="text-sm text-muted-foreground">
          {customOrderInvalid ? 'The end date must be on or after the start date.' : 'Choose a start and end date to see variant sales.'}
        </p>
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" data-testid="variant-sales-loading" />
      ) : isError || !data ? (
        <ErrorState
          message={(error as Error | null)?.message ?? "Couldn't load variant sales."}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : data.variants.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No variant sales in this period.
        </p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-border bg-card ${isFetching ? 'opacity-70' : ''}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Product / variant</th>
                <th className="p-3 font-medium text-right">Sold</th>
                <th className="p-3 font-medium text-right">Returned</th>
                <th className="p-3 font-medium text-right">Net units</th>
                <th className="p-3 font-medium text-right">Net revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.variants.map((v, i) => (
                <tr key={v.variant_id ?? `removed-${v.menu_item_id ?? ''}-${i}`} className="border-t border-border">
                  <td className="p-3">
                    <span className="block font-medium text-foreground">{v.name ?? 'Unknown product'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.label ?? 'No variant'}{v.sku ? ` · ${v.sku}` : ''}{v.variant_id === null ? ' (removed)' : ''}
                    </span>
                  </td>
                  <td className="p-3 text-right">{v.units_sold}</td>
                  <td className="p-3 text-right">{v.units_returned}</td>
                  <td className="p-3 text-right">{v.net_units}</td>
                  <td className="p-3 text-right">{formatCents(v.net_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <td className="p-3">Total</td>
                <td className="p-3 text-right">{data.totals.units_sold}</td>
                <td className="p-3 text-right">{data.totals.units_returned}</td>
                <td className="p-3 text-right">{data.totals.net_units}</td>
                <td className="p-3 text-right">{formatCents(data.totals.net_cents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {data && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{data.start_date} to {data.end_date} ({data.timezone}).</p>
          {data.basis && <p>{data.basis}</p>}
        </div>
      )}
    </div>
  );
}

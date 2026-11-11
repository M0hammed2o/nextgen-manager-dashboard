import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCents } from '@/lib/mappers';
import type { ProductPerformance, SalesWalletRange } from '@/types/api';
import { EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildQuery } from '@/components/analytics/DateRangeControl';
import { ProductImage, formatPct } from '@/components/analytics/product-bits';

// Read-only comparison of one product across the three sales channels, for the
// range the Best sellers section is currently showing. Reporting only.

const SERIES: { key: 'uber_eats' | 'mr_d' | 'general'; name: string; colour: string }[] = [
  { key: 'uber_eats', name: 'Uber Eats', colour: 'hsl(var(--primary))' },
  { key: 'mr_d', name: 'Mr D Food', colour: 'hsl(var(--accent-foreground))' },
  { key: 'general', name: 'General Sales', colour: 'hsl(var(--muted-foreground))' },
];

export function ProductPerformanceSheet({
  product, range, start, end, onClose,
}: {
  product: { id: string; name: string } | null;
  range: SalesWalletRange; start: string; end: string; onClose: () => void;
}) {
  const id = product?.id ?? null;
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['product-performance', id, range, range === 'custom' ? start : null, range === 'custom' ? end : null],
    queryFn: () => apiClient.get<ProductPerformance>(
      `/v1/business/analytics/products/${encodeURIComponent(id as string)}/performance?${buildQuery(range, start, end)}`,
    ),
    enabled: id !== null,
    // A 404 is a real answer a retry won't change; any other failure has a Retry button.
    retry: false,
  });

  const notFound = error instanceof ApiError && error.status === 404;
  const chartData = (data?.daily ?? []).map((d) => ({
    day: d.day,
    uber_eats: d.uber_eats.quantity,
    mr_d: d.mr_d.quantity,
    general: d.general.quantity,
  }));

  return (
    <Sheet open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{data?.name ?? product?.name ?? 'Product'}</SheetTitle>
          <SheetDescription>
            {data ? `${data.start_date} to ${data.end_date} (${data.timezone}). ` : ''}Reporting only. Figures are item sales before any refunds.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : notFound ? (
            <EmptyState
              icon={<SearchX className="w-8 h-8" />}
              title="Product not found"
              description="This product could not be found for your business."
            />
          ) : isError || !data ? (
            <ErrorState
              message={(error as Error | null)?.message ?? "Couldn't load this product's performance."}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <ProductImage url={data.image_url} name={data.name} className="h-14 w-14" />
                <div>
                  <p className="font-semibold text-foreground">
                    {data.name} {data.is_deleted && <Badge variant="secondary">Removed from menu</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.total_quantity} sold · {formatCents(data.total_gross_cents)} item sales
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">By channel</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">% of product units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">% of product revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.channels.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="font-medium">{c.label}</TableCell>
                        <TableCell className="text-right">{c.quantity}</TableCell>
                        <TableCell className="text-right">{formatPct(c.quantity_share_pct)}</TableCell>
                        <TableCell className="text-right">{formatCents(c.gross_cents)}</TableCell>
                        <TableCell className="text-right">{formatPct(c.revenue_share_pct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Sizes and options</h3>
                {data.variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales in this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Option</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.variants.map((v) => (
                        <TableRow key={v.label}>
                          <TableCell className="font-medium">{v.label}</TableCell>
                          <TableCell className="text-right">{v.quantity}</TableCell>
                          <TableCell className="text-right">{formatCents(v.gross_cents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Daily units by channel</h3>
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No days in this range.</p>
                ) : (
                  <div role="img" aria-label="Daily units sold by channel" data-testid="product-daily-chart">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                        <Legend />
                        {SERIES.map((s) => (
                          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.colour} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { Customer, CustomerDetail, CustomersListResponse } from '@/types/api';
import { formatCents, formatDate } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader, PageSkeleton, EmptyState, ErrorState, InlineErrorBanner } from '@/components/shared/PageComponents';
import { OrderHistoryRow } from './Orders';
import { Users, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const PER_PAGE = 20;

export default function CustomersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Debounce the search box into the actual query param — the backend
  // search is server-side (GET /v1/business/customers?search=), unlike
  // MenuPage.tsx's client-side filter, so firing a request on every
  // keystroke would spam the API. 350ms mirrors a typical "stopped typing"
  // debounce without feeling sluggish.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (search) params.set('search', search);
      return apiClient.get<CustomersListResponse>(`/v1/business/customers?${params.toString()}`);
    },
    // Keep the previous page's rows on screen while a new page/search loads,
    // rather than flashing the full-page skeleton on every pagination click.
    placeholderData: (prev) => prev,
  });

  const customers = data?.data ?? [];
  const pagination = data?.pagination;

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    error: detailError,
    refetch: refetchDetail,
    isFetching: isDetailFetching,
  } = useQuery({
    queryKey: ['customer', selectedCustomerId],
    queryFn: () => apiClient.get<CustomerDetail>(`/v1/business/customers/${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  });

  if (isLoading) return <PageSkeleton />;

  if (isError && customers.length === 0) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-6">
      {isError && customers.length > 0 && (
        <InlineErrorBanner
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Customers"
          description={pagination ? <>{pagination.total} customers</> : undefined}
        />
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or phone..."
            className="pl-9"
          />
        </div>
      </div>

      {customers.length === 0 ? (
        search ? (
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="No customers match your search"
            description={`No customer's name or phone matches "${search}". Try a different search term.`}
            action={<Button variant="outline" size="sm" onClick={() => setSearchInput('')}>Clear search</Button>}
          />
        ) : (
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="No customers yet"
            description="Customers will appear here once they place their first order."
          />
        )
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-4 font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Phone</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Orders</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Spent</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Last Order</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer: Customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedCustomerId(customer.id)}
                    >
                      <td className="p-4 font-medium text-foreground">{customer.display_name || 'Unknown'}</td>
                      <td className="p-4 text-muted-foreground">{customer.phone_number ?? '—'}</td>
                      <td className="p-4 text-foreground">{customer.order_count}</td>
                      <td className="p-4 text-foreground font-medium">{formatCents(customer.total_spent_cents)}</td>
                      <td className="p-4 text-muted-foreground">
                        {customer.last_order_at ? formatDate(customer.last_order_at) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.total_pages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Customer detail dialog */}
      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.display_name || 'Customer'}</DialogTitle>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="space-y-3">
              <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
              <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
              <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            </div>
          ) : isDetailError ? (
            <ErrorState
              message={detailError instanceof Error ? detailError.message : undefined}
              onRetry={() => refetchDetail()}
              isRetrying={isDetailFetching}
            />
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Phone:</span> <span className="text-foreground">{detail.phone_number ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Orders:</span> <span className="text-foreground">{detail.order_count}</span></div>
                <div><span className="text-muted-foreground">Total Spent:</span> <span className="text-foreground font-medium">{formatCents(detail.total_spent_cents)}</span></div>
                <div><span className="text-muted-foreground">Last Order:</span> <span className="text-foreground">{detail.last_order_at ? formatDate(detail.last_order_at) : 'Never'}</span></div>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">Order History</h4>
                {detail.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders yet.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {detail.orders.map((order) => (
                      <OrderHistoryRow key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

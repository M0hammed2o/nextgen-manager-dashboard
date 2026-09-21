import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Order } from '@/types/api';
import { formatCents, parseRandsToCents, centsToRandsInput } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RefundResponse {
  success: boolean;
  status: string;
  provider_reference?: string | null;
  error?: string | null;
  order: Order;
}

/**
 * Void / refund actions for a paid order, on the Manager Dashboard.
 *
 * The staff till has its own `ReversalPanel.tsx` for POS sales, but the
 * dashboard's PIN-less, email+password login is the only place an
 * OWNER/MANAGER can reach in a real deployment (see KNOWN_BUGS.md — a
 * cashier's 4-digit PIN must not carry manager money-movement power, and the
 * till's own void/refund panel is itself OWNER/MANAGER-gated). This mirrors
 * that panel's validation and copy for the POS case, and adds the
 * provider-refund path (routes_orders.py POST /orders/{id}/refund) for
 * online-paid, non-POS orders, which the till never needed because it only
 * ever takes cash/card-terminal payments itself.
 *
 * VOID vs REFUND, same distinction as the till's panel:
 *   Void   — the sale should never have happened; nothing was made, so
 *            stock goes back automatically. POS sales only.
 *   Refund — money goes back to the customer. The food is not assumed to
 *            come back — "restore stock" is an explicit, off-by-default
 *            choice. POS sales via the till-native endpoint; any other paid
 *            order via the business's configured payment provider.
 */
export default function OrderReversalPanel({
  order,
  role,
  onDone,
}: {
  order: Order;
  /** OWNER / MANAGER / STAFF — every endpoint below is manager-gated on the
   * backend too; this only controls whether the button is even shown. */
  role: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'none' | 'void' | 'refund'>('none');
  const [reason, setReason] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [restoreStock, setRestoreStock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManager = role === 'OWNER' || role === 'MANAGER';
  const isPos = order.source === 'POS';
  const alreadyReversed =
    order.payment_status === 'VOIDED' ||
    order.payment_status === 'REFUNDED' ||
    order.payment_status === 'PARTIALLY_REFUNDED';

  // POS sales are reversed through the till-native endpoints (no external
  // payment provider involved); any other source uses the provider refund
  // endpoint, which only ever refunds, never voids.
  const posEligible = isPos && order.payment_status === 'PAID';
  const providerEligible = !isPos && order.payment_status === 'PAID';

  const remainingCents = order.total_cents - (order.refund_amount_cents ?? 0);

  const refundMutation = useMutation({
    mutationFn: async (body: { amount_cents: number; reason: string; restore_stock?: boolean }) => {
      if (isPos) {
        return apiClient.post<Order>(`/v1/business/pos/orders/${order.id}/refund`, {
          amount_cents: body.amount_cents,
          reason: body.reason,
          restore_stock: body.restore_stock ?? false,
        });
      }
      return apiClient.post<RefundResponse>(`/v1/business/orders/${order.id}/refund`, {
        amount_cents: body.amount_cents,
        reason: body.reason,
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (body: { reason: string }) =>
      apiClient.post<Order>(`/v1/business/pos/orders/${order.id}/void`, body),
  });

  if (!isManager) return null;
  if (!alreadyReversed && !posEligible && !providerEligible) return null;

  if (alreadyReversed) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <p className="font-medium text-foreground">
          {order.payment_status === 'VOIDED' ? 'Sale voided' : 'Refunded'}
        </p>
        {order.refund_amount_cents ? (
          <p className="mt-0.5 text-muted-foreground">
            {formatCents(order.refund_amount_cents)}
            {order.refund_reference ? ` · ${order.refund_reference}` : ''}
          </p>
        ) : null}
      </div>
    );
  }

  function friendlyError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.code === 'TILL_NOT_OPEN') {
        return 'Cash refunds and voids must go into an open till. Open the till on the staff app, then try again.';
      }
      return err.message;
    }
    return err instanceof Error ? err.message : 'Could not complete that — try again.';
  }

  function resetForm() {
    setMode('none');
    setReason('');
    setAmountInput('');
    setRestoreStock(false);
    setError(null);
  }

  function openRefund() {
    setMode('refund');
    setAmountInput(centsToRandsInput(remainingCents));
    setError(null);
  }

  function openVoid() {
    setMode('void');
    setError(null);
  }

  async function submitVoid() {
    if (!reason.trim()) {
      setError('Give a reason — it appears on the audit trail.');
      return;
    }
    setError(null);
    try {
      await voidMutation.mutateAsync({ reason: reason.trim() });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Sale voided', description: 'The stock deduction has been reversed.' });
      resetForm();
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function submitRefund() {
    if (!reason.trim()) {
      setError('Give a reason — it appears on the audit trail.');
      return;
    }
    const amountCents = parseRandsToCents(amountInput);
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid refund amount in rands (e.g. 150.00).');
      return;
    }
    if (amountCents > remainingCents) {
      setError(`Refund amount cannot exceed ${formatCents(remainingCents)}.`);
      return;
    }
    setError(null);
    try {
      const result = await refundMutation.mutateAsync({
        amount_cents: amountCents,
        reason: reason.trim(),
        restore_stock: isPos ? restoreStock : undefined,
      });

      // The provider endpoint returns 200 even when the provider refund did
      // NOT actually complete (MANUAL_REQUIRED / FAILED) — payment_status is
      // only updated on a provider-confirmed COMPLETED refund. Treating that
      // response as a success here would be exactly BUG-0004's mistake
      // (claiming an action happened when it didn't), so only the POS
      // endpoint (which always either reverses or throws) and a genuinely
      // COMPLETED provider result count as done.
      if (!isPos) {
        const providerResult = result as RefundResponse;
        if (!providerResult.success || providerResult.status !== 'COMPLETED') {
          setError(
            providerResult.error
              ? `Refund not completed: ${providerResult.error}`
              : `Refund not completed (provider status: ${providerResult.status}). No money has moved and this order is still marked ${order.payment_status}.`
          );
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Refund recorded', description: formatCents(amountCents) });
      resetForm();
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  const busy = refundMutation.isPending || voidMutation.isPending;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-semibold text-foreground">Void / refund this sale</p>

      {mode === 'none' && (
        <div className="mt-2 flex gap-2">
          {posEligible && (
            <Button type="button" variant="outline" size="sm" onClick={openVoid}>
              Void
            </Button>
          )}
          {(posEligible || providerEligible) && (
            <Button type="button" variant="outline" size="sm" onClick={openRefund}>
              Refund
            </Button>
          )}
        </div>
      )}

      {mode === 'void' && (
        <AlertDialog open onOpenChange={(open) => !open && !busy && resetForm()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void this sale?</AlertDialogTitle>
              <AlertDialogDescription>
                The full {formatCents(order.total_cents)} sale and its stock deduction are
                reversed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="void-reason">Reason (required)</Label>
              <Textarea
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={255}
                placeholder="e.g. Wrong item rung up"
                autoFocus
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} onClick={resetForm}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); submitVoid(); }}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Void sale
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {mode === 'refund' && (
        <AlertDialog open onOpenChange={(open) => !open && !busy && resetForm()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Refund this order?</AlertDialogTitle>
              <AlertDialogDescription>
                {isPos
                  ? 'Money goes back to the customer. This does not put the food back into stock unless you tick the box below.'
                  : "Refunded through this business's configured payment provider."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">Amount (R)</Label>
                <Input
                  id="refund-amount"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Up to {formatCents(remainingCents)} refundable.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Reason (required)</Label>
                <Textarea
                  id="refund-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={255}
                  placeholder="e.g. Customer unhappy"
                />
              </div>
              {isPos && (
                <label className="flex items-start gap-2 rounded-md border border-border p-2.5">
                  <input
                    type="checkbox"
                    checked={restoreStock}
                    onChange={(e) => setRestoreStock(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Put the items back into stock</span>
                    <br />
                    Only tick this if the food was never made or can be resold.
                  </span>
                </label>
              )}
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} onClick={resetForm}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); submitRefund(); }}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refund
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

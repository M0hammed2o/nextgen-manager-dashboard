import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Order } from '@/types/api';
import { formatCents, formatDate, parseRandsToCents, centsToRandsInput } from '@/lib/mappers';
import {
  cashAllocatedCents, confirmedProviderRefunds, isMixedCashSplit,
  knownProviderRefundCents, pendingProviderRefunds, providerLabel,
} from '@/lib/providerRefund';
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
  onOrderUpdated,
}: {
  order: Order;
  /** OWNER / MANAGER / STAFF — every endpoint below is manager-gated on the
   * backend too; this only controls whether the button is even shown. */
  role: string;
  onDone: () => void;
  /** Called instead of onDone when the reversal left something for the
   * manager still to do (a Pay-by-Link refund that has to be completed at
   * the provider), so the parent can keep showing the fresh order rather
   * than close it. Falls back to onDone when not supplied. */
  onOrderUpdated?: (order: Order) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'none' | 'void' | 'refund'>('none');
  const [reason, setReason] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [cashInput, setCashInput] = useState('');
  // Set if the backend still says CASH_REFUND_PORTION_REQUIRED although this
  // copy of the order did not look like a mixed split (stale data / race):
  // show the field so the manager has a way forward instead of a dead end.
  const [forceCashPortion, setForceCashPortion] = useState(false);
  const [restoreStock, setRestoreStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingProviderRefund, setConfirmingProviderRefund] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

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

  // A partial refund of a split order mixing cash and non-cash is the one
  // shape where the backend refuses to guess the cash portion
  // (CASH_REFUND_PORTION_REQUIRED). Every other shape — any full refund, or a
  // partial of an all-cash / all-non-cash split — is deterministic, so the
  // field is not shown at all. "Partial" is relative to total_cents, exactly
  // as the backend compares it.
  const mixedCashSplit = isPos && isMixedCashSplit(order);
  const cashAllocated = cashAllocatedCents(order);
  const parsedAmountCents = parseRandsToCents(amountInput);
  const isPartialAmount =
    parsedAmountCents !== null && parsedAmountCents > 0 && parsedAmountCents < order.total_cents;
  const needsCashPortion = isPos && isPartialAmount && (mixedCashSplit || forceCashPortion);

  const refundMutation = useMutation({
    mutationFn: async (body: {
      amount_cents: number;
      reason: string;
      restore_stock?: boolean;
      cash_refund_cents?: number;
    }) => {
      if (isPos) {
        return apiClient.post<Order>(`/v1/business/pos/orders/${order.id}/refund`, {
          amount_cents: body.amount_cents,
          reason: body.reason,
          restore_stock: body.restore_stock ?? false,
          // Only sent when it was actually collected — the backend computes
          // it itself for every other refund shape.
          ...(body.cash_refund_cents !== undefined ? { cash_refund_cents: body.cash_refund_cents } : {}),
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

  const confirmProviderRefundMutation = useMutation({
    mutationFn: () =>
      apiClient.post<Order>(`/v1/business/pos/orders/${order.id}/confirm-provider-refund`),
  });

  function friendlyError(err: unknown): string {
    if (err instanceof ApiError) {
      switch (err.code) {
        case 'TILL_NOT_OPEN':
          return 'Cash refunds and voids must go into an open till. Open the till on the staff app, then try again.';
        case 'CASH_REFUND_PORTION_REQUIRED':
          return 'Please specify how much of this refund is being returned in cash.';
        case 'CASH_REFUND_PORTION_INVALID':
          return 'The cash part of this refund cannot be more than the refund amount, or more than this order was paid in cash.';
        case 'NO_PENDING_PROVIDER_REFUND':
          return 'This Pay-by-Link refund has already been marked as completed.';
      }
      return err.message;
    }
    return err instanceof Error ? err.message : 'Could not complete that — try again.';
  }

  /** After a refund/void: if a Pay-by-Link portion still has to be refunded
   * at the provider, say so instead of a plain "Refund recorded", and keep
   * the fresh order on screen so the manager sees what's left to do. */
  function finishReversal(updated: Order | null, plainTitle: string, plainDescription: string) {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    const pending = updated ? pendingProviderRefunds(updated) : [];
    if (updated && pending.length > 0) {
      const who = providerLabel(pending[0].provider);
      const knownCents = knownProviderRefundCents(updated, pending[0]);
      toast({
        title: updated.payment_status === 'VOIDED' ? 'Void recorded in NextGen' : 'Refund recorded in NextGen',
        description:
          knownCents !== null && pending.length === 1
            ? `${formatCents(knownCents)} Pay-by-Link refund via ${who} still required.`
            : `Pay-by-Link refund via ${who} still required.`,
      });
      resetForm();
      if (onOrderUpdated) onOrderUpdated(updated);
      else onDone();
      return;
    }
    toast({ title: plainTitle, description: plainDescription });
    resetForm();
    onDone();
  }

  async function confirmProviderRefund() {
    setProviderError(null);
    try {
      const updated = await confirmProviderRefundMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Pay-by-Link refund marked as completed' });
      setConfirmingProviderRefund(false);
      if (onOrderUpdated) onOrderUpdated(updated);
      else onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_PENDING_PROVIDER_REFUND') {
        // Already confirmed (e.g. a double-click, or another manager) — not
        // an error from the manager's point of view. Refresh and move on.
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        toast({ title: 'Already marked as completed', description: friendlyError(err) });
        setConfirmingProviderRefund(false);
        onDone();
        return;
      }
      setProviderError(friendlyError(err));
    }
  }

  if (!isManager) return null;
  if (!alreadyReversed && !posEligible && !providerEligible) return null;

  if (alreadyReversed) {
    const pending = pendingProviderRefunds(order);
    const confirmed = confirmedProviderRefunds(order);
    const recordedWord = order.payment_status === 'VOIDED' ? 'Void' : 'Refund';
    const confirming = confirmProviderRefundMutation.isPending;
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

        {pending.length > 0 && (
          <div
            className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5"
            data-testid="provider-refund-pending"
          >
            {pending.map((a, i) => {
              const knownCents = knownProviderRefundCents(order, a);
              return (
                <p key={i} className="font-medium text-foreground">
                  {knownCents !== null
                    ? `${recordedWord} recorded in NextGen — ${formatCents(knownCents)} Pay-by-Link refund via ${providerLabel(a.provider)} still required.`
                    : `${recordedWord} recorded in NextGen — Pay-by-Link refund via ${providerLabel(a.provider)} still required (the customer paid ${formatCents(a.amount_cents)} by Pay-by-Link; refund only the part of this refund that came from it).`}
                </p>
              );
            })}
            <p className="mt-1 text-xs text-muted-foreground">
              NextGen has not returned this money to the customer. Refund it in your{' '}
              {providerLabel(pending[0].provider)} dashboard, then mark it completed here.
            </p>
            {!confirmingProviderRefund ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => { setProviderError(null); setConfirmingProviderRefund(true); }}
              >
                Mark provider refund completed
              </Button>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-foreground">
                  Confirm you've actually refunded this via the {providerLabel(pending[0].provider)} dashboard.
                  NextGen can't check this for you.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={confirming} onClick={confirmProviderRefund}>
                    {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Yes, it's been refunded
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={confirming}
                    onClick={() => setConfirmingProviderRefund(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {providerError && <p className="mt-2 text-sm font-medium text-destructive">{providerError}</p>}
          </div>
        )}

        {pending.length === 0 && confirmed.map((a, i) => (
          <p key={i} className="mt-2 text-muted-foreground" data-testid="provider-refund-confirmed">
            Pay-by-Link refund confirmed via {providerLabel(a.provider)}
            {a.provider_refund_confirmed_at ? ` on ${formatDate(a.provider_refund_confirmed_at)}` : ''}.
          </p>
        ))}
      </div>
    );
  }

  function resetForm() {
    setMode('none');
    setReason('');
    setAmountInput('');
    setCashInput('');
    setForceCashPortion(false);
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
      const updated = await voidMutation.mutateAsync({ reason: reason.trim() });
      finishReversal(updated ?? null, 'Sale voided', 'The stock deduction has been reversed.');
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
    // Mirror the backend's two caps exactly (routes_pos.py refund_pos_order)
    // so the manager gets instant feedback rather than a round-trip 422.
    let cashRefundCents: number | undefined;
    if (needsCashPortion) {
      const cash = parseRandsToCents(cashInput);
      if (cash === null) {
        setError('Enter how much of this refund is being returned in cash (enter 0 if none of it is cash).');
        return;
      }
      if (cash > amountCents) {
        setError(`The cash part cannot be more than the refund amount (${formatCents(amountCents)}).`);
        return;
      }
      if (mixedCashSplit && cash > cashAllocated) {
        setError(`The cash part cannot be more than this order was paid in cash (${formatCents(cashAllocated)}).`);
        return;
      }
      cashRefundCents = cash;
    }
    setError(null);
    try {
      const result = await refundMutation.mutateAsync({
        amount_cents: amountCents,
        reason: reason.trim(),
        restore_stock: isPos ? restoreStock : undefined,
        cash_refund_cents: cashRefundCents,
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

      finishReversal(
        isPos ? ((result as Order | undefined) ?? null) : null,
        'Refund recorded',
        formatCents(amountCents),
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CASH_REFUND_PORTION_REQUIRED') {
        setForceCashPortion(true);
      }
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
              {needsCashPortion && (
                <div className="space-y-1.5">
                  <Label htmlFor="refund-cash-portion">
                    How much of this refund is being returned in cash? (R)
                  </Label>
                  <Input
                    id="refund-cash-portion"
                    inputMode="decimal"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="e.g. 0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    {mixedCashSplit
                      ? `This order was paid partly in cash (${formatCents(cashAllocated)}) and partly another way. Enter 0 if none of this refund is cash.`
                      : 'Enter 0 if none of this refund is cash.'}
                  </p>
                </div>
              )}
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

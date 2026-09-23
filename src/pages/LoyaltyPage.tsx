import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  LoyaltyProgram, LoyaltyReward, LoyaltyRewardCreate, LoyaltyRewardUpdate, CustomerLoyalty,
  LoyaltyRedeemResponse, LoyaltyAdjustmentRequest, LoyaltyAdjustmentResponse,
} from '@/types/api';
import { useAuth } from '@/lib/auth';
import { formatCents, parseRandsToCents, centsToRandsInput } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { Gift, Plus, Edit, Trash2, Loader2, Search, Award, Info, PlusCircle, MinusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Matches routes_loyalty.py's redeemable rule exactly: a reward is
 * selectable at checkout only when it has a non-null value_cents (0 counts
 * as redeemable, at a R0.00 discount — only `null`/missing means
 * manual-handover-only). Kept as one function so the UI's notion of
 * "redeemable" can never silently drift from the backend's. */
function isRedeemableAtPos(valueCents: number | null | undefined): boolean {
  return valueCents !== null && valueCents !== undefined && valueCents >= 0;
}

const TIER_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  BRONZE: 'outline',
  SILVER: 'secondary',
  GOLD: 'default',
};

// ── Program settings ─────────────────────────────────────────────────────────

function ProgramSettingsCard({ program }: { program: LoyaltyProgram }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LoyaltyProgram>(program);

  useEffect(() => setForm(program), [program]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<LoyaltyProgram>) => apiClient.put<LoyaltyProgram>('/v1/business/loyalty/program', data),
    onSuccess: (res) => {
      queryClient.setQueryData(['loyalty-program'], res);
      toast({ title: 'Loyalty program settings saved' });
    },
    onError: (err: Error) => toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
  });

  const update = <K extends keyof LoyaltyProgram>(key: K, value: LoyaltyProgram[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Gift className="w-4 h-4" /> Program settings</CardTitle>
        <CardDescription>Configure how customers earn and redeem points.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <div>
            <Label>Loyalty program enabled</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customers start earning points on paid orders, and staff can look up balances at the till.
            </p>
          </div>
          <Switch checked={form.is_enabled} onCheckedChange={(v) => update('is_enabled', v)} />
        </div>

        {form.is_enabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Points per Rand spent</Label>
                <Input
                  type="number" min={0} value={form.points_per_rand}
                  onChange={(e) => update('points_per_rand', parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bonus points per order</Label>
                <Input
                  type="number" min={0} value={form.points_per_order}
                  onChange={(e) => update('points_per_order', parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum points to redeem anything</Label>
                <Input
                  type="number" min={0} value={form.min_redemption_points}
                  onChange={(e) => update('min_redemption_points', parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Points expiry (days)</Label>
                <Input
                  type="number" min={1} value={form.points_expiry_days ?? ''}
                  placeholder="Never expires"
                  onChange={(e) => update('points_expiry_days', e.target.value ? parseInt(e.target.value, 10) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Silver tier threshold (points)</Label>
                <Input
                  type="number" min={0} value={form.silver_tier_points}
                  onChange={(e) => update('silver_tier_points', parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Gold tier threshold (points)</Label>
                <Input
                  type="number" min={0} value={form.gold_tier_points}
                  onChange={(e) => update('gold_tier_points', parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <Label>Double points promo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Temporarily award 2x points on every paid order.</p>
              </div>
              <Switch
                checked={form.double_points_promo_active}
                onCheckedChange={(v) => update('double_points_promo_active', v)}
              />
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button
            className="gap-1.5"
            onClick={() => saveMutation.mutate({
              is_enabled: form.is_enabled,
              points_per_rand: form.points_per_rand,
              points_per_order: form.points_per_order,
              points_expiry_days: form.points_expiry_days,
              min_redemption_points: form.min_redemption_points,
              silver_tier_points: form.silver_tier_points,
              gold_tier_points: form.gold_tier_points,
              double_points_promo_active: form.double_points_promo_active,
            })}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rewards catalogue ─────────────────────────────────────────────────────────

function RewardForm({ reward, onClose }: { reward: LoyaltyReward | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(reward?.name ?? '');
  const [description, setDescription] = useState(reward?.description ?? '');
  const [pointsCostInput, setPointsCostInput] = useState(reward ? String(reward.points_cost) : '100');
  const [valueInput, setValueInput] = useState(reward?.value_cents != null ? centsToRandsInput(reward.value_cents) : '');
  const [isActive, setIsActive] = useState(reward?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: LoyaltyRewardCreate | LoyaltyRewardUpdate) =>
      reward
        ? apiClient.put<LoyaltyReward>(`/v1/business/loyalty/rewards/${reward.id}`, data)
        : apiClient.post<LoyaltyReward>('/v1/business/loyalty/rewards', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-rewards'] });
      toast({ title: reward ? 'Reward updated' : 'Reward created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // Live preview of what will actually be saved, so the form never claims a
  // reward is "redeemable at POS" unless the backend would agree (non-null,
  // non-negative value_cents on an active reward) — same rule as
  // isRedeemableAtPos, applied to the in-progress input rather than the
  // saved record.
  const trimmedValue = valueInput.trim();
  const previewValueCents = trimmedValue === '' ? null : parseRandsToCents(trimmedValue);
  const valueInputIsInvalid = trimmedValue !== '' && previewValueCents === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a reward name.');
      return;
    }

    const trimmedPoints = pointsCostInput.trim();
    if (!/^\d+$/.test(trimmedPoints) || parseInt(trimmedPoints, 10) < 1) {
      setError('Points cost must be a whole number of at least 1.');
      return;
    }
    const pointsCost = parseInt(trimmedPoints, 10);

    let valueCents: number | null = null;
    if (trimmedValue !== '') {
      const parsed = parseRandsToCents(trimmedValue);
      if (parsed === null) {
        setError('Enter a valid reward value in rands (e.g. 50.00), with at most 2 decimal places — or leave it blank for a reward that must be handed over manually.');
        return;
      }
      valueCents = parsed;
    }

    mutation.mutate({
      name: trimmedName,
      description: description.trim() || null,
      points_cost: pointsCost,
      value_cents: valueCents,
      ...(reward ? { is_active: isActive } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reward-name">Reward name</Label>
        <Input id="reward-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Free coffee" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reward-description">Description (optional)</Label>
        <Input id="reward-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. One regular coffee, any flavour" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reward-points-cost">Points cost</Label>
        <Input
          id="reward-points-cost"
          type="number" step={1} value={pointsCostInput}
          onChange={(e) => setPointsCostInput(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label htmlFor="reward-value">Reward value (R) — optional</Label>
        <Input
          id="reward-value"
          inputMode="decimal"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          placeholder="e.g. 50.00"
        />
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          This is the <span className="font-medium text-foreground mx-1">actual discount applied at the till</span>
          when a customer redeems this reward. Leave it blank for a reward that has no fixed monetary value and
          must be handed over manually by staff — it will not be selectable at checkout.
        </p>
        {trimmedValue === '' ? (
          <p className="text-xs font-medium text-muted-foreground">Manual handover only — not selectable at checkout.</p>
        ) : valueInputIsInvalid ? (
          <p className="text-xs font-medium text-destructive">Not a valid rand amount yet.</p>
        ) : (
          <p className="text-xs font-medium text-foreground">
            Redeemable at POS for a {formatCents(previewValueCents)} discount.
          </p>
        )}
      </div>
      {reward && (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <div>
            <Label htmlFor="reward-active">Active</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inactive rewards no longer appear in the catalogue or the till lookup — same as removing it.
            </p>
          </div>
          <Switch id="reward-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : reward ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

function RewardsCatalogueCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LoyaltyReward | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoyaltyReward | null>(null);

  const { data: rewards, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => apiClient.get<LoyaltyReward[]>('/v1/business/loyalty/rewards'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/loyalty/rewards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-rewards'] });
      toast({ title: 'Reward removed' });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Could not remove reward', description: err.message, variant: 'destructive' });
      setDeleteTarget(null);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" /> Reward catalogue</CardTitle>
          <CardDescription>Rewards customers can redeem their points for.</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="w-4 h-4" /> Add reward
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PageSkeleton />
        ) : isError ? (
          <ErrorState message="Couldn't load your reward catalogue." onRetry={() => refetch()} isRetrying={isFetching} />
        ) : !rewards || rewards.length === 0 ? (
          <EmptyState
            icon={<Award className="w-10 h-10" />}
            title="No rewards yet"
            description="Add a reward customers can redeem their points for, like a free item or a discount voucher."
            action={<Button onClick={() => { setEditing(null); setShowModal(true); }} className="gap-1.5"><Plus className="w-4 h-4" /> Add reward</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Points cost</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell className="font-medium">{reward.name}</TableCell>
                  <TableCell className="text-muted-foreground">{reward.description || '—'}</TableCell>
                  <TableCell>{reward.points_cost} pts</TableCell>
                  <TableCell>
                    {isRedeemableAtPos(reward.value_cents) ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{formatCents(reward.value_cents)}</span>
                        <StatusBadge variant="default" label="POS redeemable" />
                      </div>
                    ) : (
                      <StatusBadge variant="outline" label="Manual handover only" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(reward); setShowModal(true); }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(reward)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit reward' : 'Add reward'}</DialogTitle></DialogHeader>
          <RewardForm reward={editing} onClose={() => setShowModal(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers will no longer be able to redeem this reward. Past redemptions are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Manual points adjustment (owner/manager only) ────────────────────────────

/**
 * OWNER/MANAGER-only manual correction to a customer's points balance — see
 * routes_loyalty.py POST /customers/{id}/adjust-points and DECISIONS.md
 * DECISION-0034. Mirrors OrderReversalPanel.tsx's role-gating pattern: the
 * backend enforces `require_owner_or_manager` regardless, `role` here only
 * controls whether the control is shown at all, so a STAFF user viewing
 * this dashboard never sees a control that would 403.
 */
function PointsAdjustmentPanel({
  customer,
  role,
  onAdjusted,
}: {
  customer: CustomerLoyalty;
  role: string;
  onAdjusted: (balanceAfter: number) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Generated fresh each time the dialog is opened (never regenerated on
  // every render/keystroke — that would defeat the point of an idempotency
  // key) so a double-clicked Save replays the same request instead of
  // applying a second adjustment.
  const idempotencyKeyRef = useRef<string | null>(null);

  const isManager = role === 'OWNER' || role === 'MANAGER';

  const mutation = useMutation({
    mutationFn: (body: LoyaltyAdjustmentRequest) =>
      apiClient.post<LoyaltyAdjustmentResponse>(
        `/v1/business/loyalty/customers/${customer.customer_id}/adjust-points`,
        body
      ),
  });

  if (!isManager) return null;

  function openDialog() {
    idempotencyKeyRef.current = crypto.randomUUID();
    setDirection('add');
    setAmountInput('');
    setReason('');
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (mutation.isPending) return;
    setOpen(false);
    idempotencyKeyRef.current = null;
  }

  async function submit() {
    setError(null);
    const trimmedAmount = amountInput.trim();
    if (!/^\d+$/.test(trimmedAmount) || parseInt(trimmedAmount, 10) < 1) {
      setError('Enter a whole number of points greater than 0.');
      return;
    }
    const amount = parseInt(trimmedAmount, 10);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError('Give a reason (at least 3 characters) — it is recorded on the audit trail.');
      return;
    }
    const pointsDelta = direction === 'add' ? amount : -amount;

    try {
      const result = await mutation.mutateAsync({
        points_delta: pointsDelta,
        reason: trimmedReason,
        idempotency_key: idempotencyKeyRef.current ?? undefined,
      });
      // Always trust the backend's balance_after over any local add/subtract
      // — never recompute the new balance client-side (see docstring above).
      onAdjusted(result.balance_after);
      toast({
        title: direction === 'add' ? 'Points added' : 'Points removed',
        description: `${direction === 'add' ? 'Credited' : 'Debited'} ${amount} points. New balance: ${result.balance_after} points. Recorded on the audit trail.`,
      });
      setOpen(false);
      idempotencyKeyRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that adjustment — try again.');
    }
  }

  return (
    <div className="pt-2 border-t border-border">
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        Adjust points manually
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Manually adjust {customer.display_name || customer.phone_number}&apos;s points
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this for a correction — e.g. a partial refund that didn&apos;t automatically reverse points, or a
              customer-service goodwill credit. This is recorded on the audit trail with your name and cannot be
              undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2" role="group" aria-label="Adjustment direction">
              <Button
                type="button"
                variant={direction === 'add' ? 'default' : 'outline'}
                className="flex-1 gap-1.5"
                onClick={() => setDirection('add')}
              >
                <PlusCircle className="w-4 h-4" /> Add points
              </Button>
              <Button
                type="button"
                variant={direction === 'remove' ? 'default' : 'outline'}
                className="flex-1 gap-1.5"
                onClick={() => setDirection('remove')}
              >
                <MinusCircle className="w-4 h-4" /> Remove points
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-amount">Points to {direction === 'add' ? 'add' : 'remove'}</Label>
              <Input
                id="adjust-amount"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="e.g. 50"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Current balance: {customer.loyalty_points_balance} pts. This will{' '}
                {direction === 'add' ? 'add points to' : 'remove points from'} that balance — enter a positive
                number of points regardless of direction; the direction buttons above control the sign.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-reason">Reason (required)</Label>
              <Textarea
                id="adjust-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={255}
                placeholder="e.g. Partial refund on order BO-000123, points not auto-reversed"
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending} onClick={closeDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(e) => { e.preventDefault(); submit(); }}
            >
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save adjustment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Customer lookup + redemption ─────────────────────────────────────────────

function CustomerLookupCard({ role }: { role: string }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<CustomerLoyalty | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState('');

  const { data: rewards } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => apiClient.get<LoyaltyReward[]>('/v1/business/loyalty/rewards'),
  });

  const lookupMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiClient.get<CustomerLoyalty>(`/v1/business/loyalty/customers/lookup?phone=${encodeURIComponent(phoneNumber)}`),
    onSuccess: (res) => {
      setCustomer(res);
      setLookupError(null);
    },
    onError: (err: Error) => {
      setCustomer(null);
      setLookupError(err.message || 'Could not find or create a customer for that phone number.');
    },
  });

  const redeemMutation = useMutation({
    mutationFn: (rewardId: string) =>
      apiClient.post<LoyaltyRedeemResponse>('/v1/business/loyalty/redeem', {
        customer_id: customer?.customer_id,
        reward_id: rewardId,
      }),
    onSuccess: (res) => {
      setCustomer((prev) => (prev ? { ...prev, loyalty_points_balance: res.balance_after } : prev));
      toast({
        title: 'Redemption recorded',
        description: `Recorded a redemption of ${Math.abs(res.points_delta)} points. New balance: ${res.balance_after} points.`,
      });
      setSelectedRewardId('');
    },
    onError: (err: Error) => toast({ title: 'Could not record redemption', description: err.message, variant: 'destructive' }),
  });

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    lookupMutation.mutate(phone.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> Customer lookup</CardTitle>
        <CardDescription>Look up a customer by phone number to check their points balance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleLookup} className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 27821234567"
          />
          <Button type="submit" variant="outline" className="gap-1.5 shrink-0" disabled={!phone.trim() || lookupMutation.isPending}>
            {lookupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Look up
          </Button>
        </form>

        {lookupError && (
          <ErrorState message={lookupError} onRetry={() => lookupMutation.mutate(phone.trim())} isRetrying={lookupMutation.isPending} />
        )}

        {!customer && !lookupError && (
          <p className="text-sm text-muted-foreground">Enter a phone number above to look up or create a customer.</p>
        )}

        {customer && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{customer.display_name || customer.phone_number}</p>
                <p className="text-xs text-muted-foreground">{customer.phone_number}</p>
              </div>
              <StatusBadge variant={TIER_VARIANT[customer.loyalty_tier] ?? 'outline'} label={customer.loyalty_tier} />
            </div>
            <p className="text-2xl font-bold text-foreground">{customer.loyalty_points_balance} pts</p>

            {rewards && rewards.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label>Record a redemption</Label>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  This only deducts points from the customer's balance and records the redemption — it does not
                  apply a discount to any order. Adjust the bill manually at the till if the reward is a discount.
                </p>
                <div className="flex gap-2">
                  <select
                    value={selectedRewardId}
                    onChange={(e) => setSelectedRewardId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a reward…</option>
                    {rewards.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.points_cost} pts)</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={!selectedRewardId || redeemMutation.isPending}
                    onClick={() => redeemMutation.mutate(selectedRewardId)}
                  >
                    {redeemMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Record redemption
                  </Button>
                </div>
              </div>
            )}

            <PointsAdjustmentPanel
              customer={customer}
              role={role}
              onAdjusted={(balanceAfter) =>
                setCustomer((prev) => (prev ? { ...prev, loyalty_points_balance: balanceAfter } : prev))
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const { user } = useAuth();
  const { data: program, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => apiClient.get<LoyaltyProgram>('/v1/business/loyalty/program'),
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !program) {
    return <ErrorState message="Couldn't load your loyalty program." onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Loyalty</h1>
        <p className="text-sm text-muted-foreground">Reward repeat customers with points on every order</p>
      </div>

      <ProgramSettingsCard program={program} />

      {program.is_enabled ? (
        <>
          <RewardsCatalogueCard />
          <CustomerLookupCard role={user?.role ?? ''} />
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<Gift className="w-10 h-10" />}
              title="Loyalty isn't enabled yet"
              description="Turn on the loyalty program above to start earning points on orders, add rewards, and look up customer balances."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

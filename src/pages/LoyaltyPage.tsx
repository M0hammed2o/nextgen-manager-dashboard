import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  LoyaltyProgram, LoyaltyReward, LoyaltyRewardCreate, CustomerLoyalty, LoyaltyRedeemResponse,
} from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { Gift, Plus, Edit, Trash2, Loader2, Search, Award, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const [pointsCost, setPointsCost] = useState(reward?.points_cost ?? 100);

  const mutation = useMutation({
    mutationFn: (data: LoyaltyRewardCreate) =>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, description: description || null, points_cost: pointsCost });
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
          type="number" min={1} value={pointsCost}
          onChange={(e) => setPointsCost(parseInt(e.target.value, 10) || 1)}
          required
        />
      </div>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell className="font-medium">{reward.name}</TableCell>
                  <TableCell className="text-muted-foreground">{reward.description || '—'}</TableCell>
                  <TableCell>{reward.points_cost} pts</TableCell>
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

// ── Customer lookup + redemption ─────────────────────────────────────────────

function CustomerLookupCard() {
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
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
          <CustomerLookupCard />
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

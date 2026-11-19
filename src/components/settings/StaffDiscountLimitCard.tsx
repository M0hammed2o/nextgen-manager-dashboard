import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { centsToRandsInput, formatCents, parseRandsToCents } from '@/lib/mappers';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Mirrors the backend's typo guard (routes_business.MAX_STAFF_DISCOUNT_CEILING_CENTS). */
export const MAX_STAFF_DISCOUNT_CENTS = 10_000_000;

/**
 * The largest discount a cashier or manager may give on one till sale without
 * the owner (Business.max_staff_discount_cents; 0 = none). The server enforces
 * it on every POS order. Only the OWNER may change it (it binds managers too),
 * so it saves on its own with just this field: a manager sees it read-only and
 * the page's main Save never sends it.
 */
export function StaffDiscountLimitCard({ valueCents }: { valueCents: number }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const qc = useQueryClient();
  const { toast } = useToast();
  const [raw, setRaw] = useState(centsToRandsInput(valueCents));
  useEffect(() => setRaw(centsToRandsInput(valueCents)), [valueCents]);

  const cents = parseRandsToCents(raw);
  const problem =
    cents === null ? 'Enter an amount like 50 or 49.99 (0 means staff cannot give discounts).'
    : cents > MAX_STAFF_DISCOUNT_CENTS ? `The most you can set is ${formatCents(MAX_STAFF_DISCOUNT_CENTS)}.`
    : null;
  const dirty = cents !== null && cents !== valueCents;

  const save = useMutation({
    mutationFn: () => apiClient.put('/v1/business/settings', { max_staff_discount_cents: cents }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast({ title: 'Staff discount limit saved' }); },
    onError: (err: Error) => toast({ title: 'Could not save the discount limit', description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-2 pt-2 border-t border-border" data-testid="staff-discount-limit">
      <Label htmlFor="max-staff-discount">Staff discount limit (R per sale)</Label>
      <p className="text-xs text-muted-foreground">
        The biggest discount a cashier or manager can give on one sale without you. 0 means only the owner can give
        discounts. The owner is never limited.
      </p>
      {isOwner ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="relative w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R</span>
            <Input
              id="max-staff-discount" inputMode="decimal" className="pl-7" value={raw}
              onChange={(e) => setRaw(e.target.value)} aria-invalid={!!problem}
              aria-describedby={problem ? 'max-staff-discount-error' : undefined}
            />
          </div>
          <Button type="button" variant="outline" disabled={!dirty || !!problem || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save limit'}
          </Button>
          {problem && <p id="max-staff-discount-error" role="alert" className="basis-full text-xs text-destructive">{problem}</p>}
        </div>
      ) : (
        <p className="text-sm" id="max-staff-discount">
          <strong>{formatCents(valueCents)}</strong>{' '}
          <span className="text-muted-foreground">Only the owner can change this.</span>
        </p>
      )}
    </div>
  );
}

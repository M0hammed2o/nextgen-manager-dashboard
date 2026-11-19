import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Landmark, Loader2, MapPin } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { EVENT_SUBSCRIPTIONS_KEY, useEventSubscriptions } from '@/hooks/use-event-subscriptions';
import { useEventAccess } from '@/hooks/use-event-access';
import { useToast } from '@/hooks/use-toast';
import {
  EFT_INSTRUCTIONS_PLACEHOLDER, billableDaysInRange, coveredDays, estimateCents, formatDay, formatRange,
  parseIsoDay, subscriptionErrorMessage,
  type EventSubscription, type EventSubscriptionsEvent,
} from '@/lib/souk';
import { formatCents } from '@/lib/mappers';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/components/shared/PageComponents';
import { EventAccessBanner } from '@/components/shared/EventAccessBanner';
import { EmailVerificationBanner } from '@/components/shared/EmailVerificationBanner';
import { useOptionalAuth } from '@/lib/auth';

/**
 * Event days & payment (souk vendor). The vendor picks a contiguous range of
 * billable event days, the API prices it (the on-screen figure before that is
 * a labelled estimate), and payment is claimed by submitting the EFT
 * reference. A claim never marks anything paid: NextGen confirms it, and
 * only then does the subscription turn PAID and selling open for those days.
 */
export default function EventDaysPage() {
  const subs = useEventSubscriptions();
  const access = useEventAccess();
  const auth = useOptionalAuth();

  if (subs.isLoading) return <PageSkeleton />;
  if (subs.error || !subs.data) {
    return (
      <ErrorState
        message="We could not load your event days."
        onRetry={() => subs.refetch()}
        isRetrying={subs.isFetching}
      />
    );
  }

  const events = subs.data.events;
  return (
    <div className="space-y-6">
      <PageHeader title="Event days and payment" description="Choose the days you will trade, then pay for them." />

      {access.data?.is_event_vendor && (
        <EmailVerificationBanner status={access.data.email_verification} email={auth?.user?.email} />
      )}
      {access.data?.is_event_vendor && <EventAccessBanner level={access.data.access_level} reason={access.data.reason} />}

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-10 w-10" />}
          title="No events yet"
          description="This business is not registered for an event."
          action={<Button asChild variant="outline"><Link to="/">Back to dashboard</Link></Button>}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-5 w-5" /> How to pay</CardTitle>
              <CardDescription>Pay by EFT, then submit the reference from your bank below.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm" data-testid="eft-instructions">{EFT_INSTRUCTIONS_PLACEHOLDER}</p>
            </CardContent>
          </Card>
          {events.map((e) => <EventDaysCard key={e.event_id} event={e} />)}
        </>
      )}
    </div>
  );
}

function EventDaysCard({ event }: { event: EventSubscriptionsEvent }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { billable_days: billable, day_rate_cents: rate } = event.quote_options;

  // Selected range endpoints (ISO). start === end means a single day.
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [lastQuote, setLastQuote] = useState<EventSubscription | null>(null);

  const covered = useMemo(() => coveredDays(billable, event.subscriptions), [billable, event.subscriptions]);

  const pick = (day: string) => {
    setFormError('');
    if (start === null || end === null || start !== end) {
      // Nothing selected, or a finished range: start again from this day.
      setStart(day);
      setEnd(day);
      return;
    }
    // One day selected: the second tap closes the range (either direction).
    const lo = day < start ? day : start;
    const hi = day < start ? start : day;
    // A range may not swallow a day that is already covered by a subscription.
    if (billableDaysInRange(billable, lo, hi).some((d) => covered.has(d))) {
      setFormError('That range includes days you have already chosen. Pick days that are not already covered.');
      setStart(day);
      setEnd(day);
      return;
    }
    setStart(lo);
    setEnd(hi);
  };

  const selectedDays = start && end ? billableDaysInRange(billable, start, end) : [];

  const quote = useMutation({
    mutationFn: () =>
      apiClient.post<EventSubscription>('/v1/business/event-subscriptions', {
        event_id: event.event_id,
        starts_on: start,
        ends_on: end,
      }),
    onSuccess: (sub) => {
      setLastQuote(sub);
      setStart(null);
      setEnd(null);
      setFormError('');
      queryClient.invalidateQueries({ queryKey: EVENT_SUBSCRIPTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['event-access'] });
      toast({ title: 'Quote created', description: `${formatCents(sub.amount_cents)} for ${sub.billable_days} day${sub.billable_days === 1 ? '' : 's'}.` });
    },
    onError: (err) => setFormError(subscriptionErrorMessage(err, 'Could not create your quote. Please try again.')),
  });

  const liveSubs = event.subscriptions.filter((s) => s.status !== 'VOID');
  const voidSubs = event.subscriptions.filter((s) => s.status === 'VOID');

  // Group the pickable days by month so a long event stays readable.
  const months = useMemo(() => {
    const out: { label: string; days: string[] }[] = [];
    for (const d of billable) {
      const label = parseIsoDay(d).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.label === label) last.days.push(d);
      else out.push({ label, days: [d] });
    }
    return out;
  }, [billable]);

  return (
    <Card data-testid={`event-card-${event.event_id}`}>
      <CardHeader>
        <CardTitle className="text-lg">{event.event_name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {event.venue && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {event.venue}</span>}
          <span>{event.category === 'FOOD' ? 'Food stall' : 'Clothing stall'}</span>
          <span>{formatCents(rate)} per day (incl. VAT)</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!event.can_subscribe ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            {event.event_status === 'CANCELLED'
              ? 'This event has been cancelled, so days cannot be added.'
              : billable.length === 0
                ? 'The event calendar has not been published yet. You can choose days once it is.'
                : 'Days cannot be added for this event right now.'}
          </p>
        ) : (
          <section aria-label="Choose your days" className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Choose your days</h3>
              <p className="text-sm text-muted-foreground">
                Tap your first day, then your last day. Only event days can be picked.
              </p>
            </div>

            {months.map((m) => (
              <div key={m.label} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
                  {m.days.map((d) => {
                    const isCovered = covered.has(d);
                    const selected = !!start && !!end && d >= start && d <= end;
                    const date = parseIsoDay(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={isCovered}
                        aria-pressed={selected}
                        aria-label={formatDay(d, { weekday: true }) + (isCovered ? ' (already chosen)' : '')}
                        onClick={() => pick(d)}
                        className={cn(
                          'flex min-h-14 flex-col items-center justify-center rounded-lg border text-sm transition-colors',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                          isCovered && 'cursor-not-allowed opacity-40 hover:bg-card',
                        )}
                      >
                        <span className="text-[11px] uppercase">{date.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                        <span className="text-base font-semibold tabular-nums">{date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {formError && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm" data-testid="estimate">
                {start && end ? (
                  <>
                    <p className="font-medium">{formatRange(start, end)} ({selectedDays.length} day{selectedDays.length === 1 ? '' : 's'})</p>
                    <p className="text-muted-foreground">
                      Estimate: {formatCents(estimateCents(rate, billable, start, end))}. The final price is confirmed when you create the quote.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No days selected yet.</p>
                )}
              </div>
              <Button className="min-h-11 w-full sm:w-auto" disabled={!start || !end || quote.isPending} onClick={() => quote.mutate()}>
                {quote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create quote'}
              </Button>
            </div>

            {lastQuote && (
              <p role="status" className="text-sm" data-testid="last-quote">
                Quote created: <strong>{formatCents(lastQuote.amount_cents)}</strong> for {lastQuote.billable_days} day{lastQuote.billable_days === 1 ? '' : 's'} ({formatRange(lastQuote.starts_on, lastQuote.ends_on)}). Pay it below.
              </p>
            )}
          </section>
        )}

        <section aria-label="Your subscriptions" className="space-y-3">
          <h3 className="text-sm font-semibold">Your days and payments</h3>
          {liveSubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not chosen any days yet.</p>
          ) : (
            liveSubs.map((s) => <SubscriptionRow key={s.id} sub={s} />)
          )}
          {voidSubs.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">{voidSubs.length} cancelled</summary>
              <ul className="mt-2 space-y-1">
                {voidSubs.map((s) => <li key={s.id}>{formatRange(s.starts_on, s.ends_on)} (cancelled)</li>)}
              </ul>
            </details>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function SubscriptionRow({ sub }: { sub: EventSubscription }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: EVENT_SUBSCRIPTIONS_KEY });
    queryClient.invalidateQueries({ queryKey: ['event-access'] });
  };

  const claim = useMutation({
    mutationFn: () => apiClient.post<EventSubscription & { already_claimed: boolean }>(
      `/v1/business/event-subscriptions/${sub.id}/payment-claim`, { reference: reference.trim() },
    ),
    onSuccess: () => {
      setClaiming(false);
      setReference('');
      setError('');
      refresh();
      toast({ title: 'Payment reference sent', description: 'NextGen will confirm your payment. Selling opens once it is confirmed.' });
    },
    onError: (err) => {
      setError(subscriptionErrorMessage(err, 'Could not submit your reference. Please try again.'));
      // A 409 means the row changed under us; re-read it.
      refresh();
    },
  });

  const cancel = useMutation({
    mutationFn: () => apiClient.post<EventSubscription>(`/v1/business/event-subscriptions/${sub.id}/cancel`),
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
      toast({ title: 'Cancelled', description: 'That quote has been cancelled.' });
    },
    onError: (err) => {
      setConfirmCancel(false);
      setError(subscriptionErrorMessage(err, 'Could not cancel. Please try again.'));
      refresh();
    },
  });

  const claimed = sub.status === 'UNPAID' && !!sub.payment_claim_reference;

  const badge = sub.status === 'PAID'
    ? <Badge className="bg-success text-success-foreground hover:bg-success">Paid</Badge>
    : claimed
      ? <Badge variant="secondary">Claimed, awaiting confirmation</Badge>
      : <Badge variant="outline">Awaiting payment</Badge>;

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm" data-testid={`subscription-${sub.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{formatRange(sub.starts_on, sub.ends_on)}</p>
          <p className="text-muted-foreground">
            {sub.billable_days} day{sub.billable_days === 1 ? '' : 's'} at {formatCents(sub.day_rate_cents)} = <span className="font-medium text-foreground">{formatCents(sub.amount_cents)}</span>
          </p>
        </div>
        {badge}
      </div>

      {sub.status === 'PAID' && sub.paid_at && (
        <p className="text-muted-foreground">Payment confirmed on {formatDay(sub.paid_at.slice(0, 10))}.</p>
      )}
      {claimed && (
        <p className="text-muted-foreground">
          You sent reference <span className="font-mono text-foreground">{sub.payment_claim_reference}</span>. NextGen will confirm it; you do not need to do anything else.
        </p>
      )}

      {error && <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-destructive">{error}</div>}

      {sub.status === 'UNPAID' && (
        claiming ? (
          <form
            className="space-y-2"
            onSubmit={(e) => { e.preventDefault(); if (reference.trim()) { setError(''); claim.mutate(); } }}
          >
            <Label htmlFor={`ref-${sub.id}`}>EFT payment reference</Label>
            <Input id={`ref-${sub.id}`} value={reference} onChange={(e) => setReference(e.target.value)}
              maxLength={255} autoComplete="off" placeholder="The reference on your bank proof of payment" />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11" disabled={!reference.trim() || claim.isPending}>
                {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit reference'}
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setClaiming(false); setError(''); }}>Back</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant={claimed ? 'outline' : 'default'} onClick={() => { setClaiming(true); setReference(sub.payment_claim_reference ?? ''); setError(''); }}>
              {claimed ? 'Change reference' : "I've paid, submit EFT reference"}
            </Button>
            <Button className="min-h-11" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel quote</Button>
          </div>
        )
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatRange(sub.starts_on, sub.ends_on)} will be released so you can choose those days again.
              {claimed && ' If you have already paid, do not cancel: contact NextGen instead.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); cancel.mutate(); }}>Cancel quote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

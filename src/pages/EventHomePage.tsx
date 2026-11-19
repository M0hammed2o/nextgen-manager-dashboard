import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Circle, ExternalLink, MapPin, Store } from 'lucide-react';
import { useEventAccess } from '@/hooks/use-event-access';
import { useEventSubscriptions } from '@/hooks/use-event-subscriptions';
import { useSetupProgress } from '@/hooks/use-setup-progress';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { formatDay, type EventAccessEvent, type EventSubscriptionsResponse } from '@/lib/souk';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/components/shared/PageComponents';
import { EventAccessBanner } from '@/components/shared/EventAccessBanner';
import { EmailVerificationBanner } from '@/components/shared/EmailVerificationBanner';
import { useOptionalAuth } from '@/lib/auth';
import { EventWhatsAppCard } from '@/components/shared/EventWhatsAppCard';

type StepStatus = 'done' | 'partial' | 'todo' | 'manual';

interface ChecklistStep {
  key: string;
  label: string;
  description: string;
  detail: string;
  status: StepStatus;
  href?: string;
  external?: boolean;
  actionLabel: string;
}

const STAFF_APP_URL = import.meta.env.VITE_STAFF_APP_URL || 'https://staff.nextgenintelligence.co.za';

function daysAndPaymentSteps(subs: EventSubscriptionsResponse | undefined, loading: boolean): ChecklistStep[] {
  const unknown = (what: string) => (loading ? 'Checking...' : `Could not check your ${what} yet`);
  const all = (subs?.events ?? []).flatMap((e) => e.subscriptions).filter((s) => s.status !== 'VOID');
  const paid = all.filter((s) => s.status === 'PAID');
  const unpaid = all.filter((s) => s.status === 'UNPAID');
  const claimed = unpaid.filter((s) => s.payment_claim_reference);

  const days: ChecklistStep = {
    key: 'days',
    label: 'Choose your event days',
    description: 'Pick the days you will trade. You are quoted a price straight away.',
    status: all.length > 0 ? 'done' : 'todo',
    detail: !subs ? unknown('days') : all.length > 0
      ? `${all.length} subscription${all.length === 1 ? '' : 's'} chosen`
      : 'No days chosen yet',
    href: '/event/days',
    actionLabel: all.length > 0 ? 'View days' : 'Choose days',
  };

  const payment: ChecklistStep = {
    key: 'payment',
    label: 'Pay for your days',
    description: 'Pay by EFT, then submit your payment reference. Selling opens once NextGen confirms it.',
    status: paid.length > 0 && unpaid.length === 0 ? 'done' : paid.length > 0 || claimed.length > 0 ? 'partial' : 'todo',
    detail: !subs ? unknown('payments')
      : paid.length > 0 && unpaid.length === 0 ? 'All chosen days are paid'
        : claimed.length > 0 ? `${claimed.length} payment${claimed.length === 1 ? '' : 's'} awaiting confirmation`
          : unpaid.length > 0 ? 'A quote is waiting for payment'
            : 'Choose your days first',
    href: '/event/days',
    actionLabel: unpaid.length > 0 ? 'Pay now' : 'View payments',
  };
  return [days, payment];
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-success" aria-label="Done" />;
  if (status === 'partial') return <AlertCircle className="h-5 w-5 text-warning" aria-label="In progress" />;
  return <Circle className="h-5 w-5 text-muted-foreground" aria-label={status === 'manual' ? 'Check yourself' : 'To do'} />;
}

/**
 * Home for a logged-in event (souk) vendor. Reuses the existing setup
 * progress (business details, menu, staff, stock) rather than building a
 * parallel checklist, and adds the event-only steps (days, payment, test
 * your till). Every status is read from real records; the one step the
 * server cannot know (a practice sale on your own till) is shown as a
 * manual check, not guessed.
 */
export default function EventHomePage() {
  const access = useEventAccess();
  const setup = useSetupProgress();
  const settings = useBusinessSettings();
  const subs = useEventSubscriptions();
  const auth = useOptionalAuth();

  if (access.isLoading) return <PageSkeleton />;
  if (access.error || !access.data) {
    return (
      <ErrorState
        message="We could not load your event details."
        onRetry={() => access.refetch()}
        isRetrying={access.isFetching}
      />
    );
  }
  const data = access.data;
  if (!data.is_event_vendor) {
    return (
      <EmptyState
        icon={<Store className="h-10 w-10" />}
        title="This business is not an event vendor"
        description="The event checklist is only for stalls registered at an event."
        action={<Button asChild variant="outline"><Link to="/">Back to dashboard</Link></Button>}
      />
    );
  }

  const stepsFor = (key: string) => setup.data?.steps.find((s) => s.key === key);
  const businessStep = stepsFor('business');
  const menuStep = stepsFor('menu');
  const staffStep = stepsFor('staff');
  const stockSteps = ['ingredients', 'opening_stock'].map(stepsFor).filter((s) => !!s);
  const isClothing = data.events.some((e) => e.category === 'CLOTHING');
  const hasLogo = !!settings.data?.logo_url;

  const fromSetup = (
    key: string, label: string, step: ReturnType<typeof stepsFor>, href: string, description: string, actionLabel: string,
    extra?: string,
  ): ChecklistStep => ({
    key, label, description, href, actionLabel,
    status: step ? step.status : 'todo',
    detail: [step ? step.detail : setup.isError ? 'Could not check this yet' : 'Checking...', extra].filter(Boolean).join(' '),
  });

  const steps: ChecklistStep[] = [
    fromSetup('business', 'Business details', businessStep, '/settings',
      'Your name, address and phone number appear on your till slip.', 'Open settings'),
    {
      key: 'logo', label: 'Logo', href: '/settings/branding', actionLabel: 'Add logo',
      description: 'Shown on your till and receipts.',
      status: settings.data ? (hasLogo ? 'done' : 'todo') : 'todo',
      detail: settings.data ? (hasLogo ? 'Logo uploaded' : 'No logo yet') : settings.isError ? 'Could not check this yet' : 'Checking...',
    },
    fromSetup('menu', isClothing ? 'Catalogue' : 'Menu', menuStep, '/menu',
      isClothing ? 'The items you sell and their prices.' : 'The items you sell and their prices.', 'Open menu',
      isClothing ? 'Sizes and colours as variants are coming soon; for now add each size or colour as its own item.' : undefined),
    ...stockSteps.map((s) => ({
      key: s!.key, label: s!.label, description: s!.description, detail: s!.detail,
      status: s!.status as StepStatus, href: s!.href ?? '/stock', actionLabel: 'Open',
    })),
    fromSetup('staff', 'Staff and till PIN', staffStep, '/staff',
      'Add the people who will run your till and give each a PIN.', 'Manage staff'),
    ...daysAndPaymentSteps(subs.data, subs.isLoading),
    {
      key: 'test-till', label: 'Test your till', status: 'manual', actionLabel: 'Open the staff app', href: STAFF_APP_URL, external: true,
      description: 'Practise before your first trading day.',
      detail: 'Log in to the staff app with a till PIN, switch on training mode, and ring up a practice sale. Nothing in training mode is a real sale.',
    },
  ];

  const countable = steps.filter((s) => s.status !== 'manual');
  const done = countable.filter((s) => s.status === 'done').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>Welcome{settings.data?.name ? `, ${settings.data.name}` : ''}</>}
        description="Everything you need to get ready for your event."
      />

      <EmailVerificationBanner status={data.email_verification} email={auth?.user?.email} />
      <EventAccessBanner level={data.access_level} reason={data.reason} />

      {data.events.map((e) => <EventSummary key={e.event_id} event={e} />)}

      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Your checklist</p>
            <p className="text-sm font-semibold tabular-nums" data-testid="checklist-progress">{done} of {countable.length} done</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${countable.length ? Math.round((done / countable.length) * 100) : 0}%` }} />
          </div>
        </CardContent>
      </Card>

      {(setup.isError || subs.isError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>Some checklist items could not be checked just now.</span>
          <Button size="sm" variant="outline" onClick={() => { setup.refetch(); subs.refetch(); settings.refetch(); }}>Retry</Button>
        </div>
      )}

      <ol className="space-y-3" aria-label="Event checklist">
        {steps.map((step) => (
          <li key={step.key}>
            <Card className={step.status === 'done' ? 'opacity-75' : undefined}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 flex-none"><StatusIcon status={step.status} /></div>
                  <div className="min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    <p className={`mt-1 text-sm ${step.status === 'done' ? 'text-success' : step.status === 'partial' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {step.detail}
                    </p>
                  </div>
                </div>
                {step.href && (
                  <Button asChild variant={step.status === 'done' ? 'outline' : 'default'} className="min-h-11 w-full sm:w-auto">
                    {step.external ? (
                      <a href={step.href} target="_blank" rel="noreferrer">{step.actionLabel} <ExternalLink className="ml-2 h-4 w-4" /></a>
                    ) : (
                      <Link to={step.href}>{step.actionLabel} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      {/* Optional, so not counted in the checklist progress above. */}
      {data.whatsapp && <EventWhatsAppCard whatsapp={data.whatsapp} />}
    </div>
  );
}

function EventSummary({ event }: { event: EventAccessEvent }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4 text-sm">
        <p className="text-base font-semibold">{event.event_name}</p>
        {event.venue && (
          <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {event.venue}</p>
        )}
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          {event.calendar_published && event.first_day && event.last_day
            ? `${formatDay(event.first_day)} to ${formatDay(event.last_day)}`
            : 'Event dates not published yet'}
        </p>
        {event.stall_code && <p className="text-muted-foreground">Stall code: <span className="font-mono">{event.stall_code}</span></p>}
      </CardContent>
    </Card>
  );
}

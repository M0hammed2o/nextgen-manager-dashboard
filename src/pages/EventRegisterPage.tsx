import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2, MailCheck, MapPin } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  type EventCategory, type PublicEvent, type RegisterRequest, type RegisterResponse,
  formatDay, passwordProblem, registrationErrorMessage,
} from '@/lib/souk';
import { formatCents } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/PageComponents';
import { ResendVerificationButton } from '@/components/shared/ResendVerificationButton';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

/**
 * Public, unauthenticated vendor registration for one event
 * (`/events/:slug/register`). Reads GET /v1/public/events/{slug} and submits
 * POST /v1/public/events/{slug}/register.
 *
 * The backend deliberately answers a bad registration code and similar with
 * ONE generic error (403 REGISTRATION_REJECTED). An email that already has an
 * account gets exactly the same 202 "check your email" answer as a new one
 * (the backend creates nothing and emails that address instead), so the form
 * can't be used to probe which emails exist. This page therefore never says
 * WHY a registration failed, and after any accepted registration it shows the
 * same "Check your email" screen. The business code is no longer in the
 * response; it arrives with the verification email and on /verify-email.
 * The password lives only in this component's state while the form is open
 * and is cleared on success; it is never persisted anywhere.
 */

export default function EventRegisterPage() {
  const { slug = '' } = useParams<{ slug: string }>();

  const eventQuery = useQuery({
    queryKey: ['public-event', slug],
    queryFn: () => apiClient.get<PublicEvent>(`/v1/public/events/${encodeURIComponent(slug)}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-xl space-y-6 p-4 py-8 sm:p-6">
        <div className="flex items-center gap-3">
          <img src={logoNextgen} alt="NextGen Intelligence" className="h-10 w-10 rounded-lg object-cover" />
          <span className="text-sm font-semibold text-foreground">NextGen Intelligence</span>
        </div>

        {eventQuery.isLoading ? (
          <div className="space-y-4" data-testid="event-register-loading">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : eventQuery.error instanceof ApiError && eventQuery.error.status === 404 ? (
          <Card>
            <CardHeader>
              <CardTitle>Event not found</CardTitle>
              <CardDescription>
                We could not find this event. Check the link you were given, or ask the organiser to resend it.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : eventQuery.error || !eventQuery.data ? (
          <ErrorState
            message="We could not load this event. Check your connection and try again."
            onRetry={() => eventQuery.refetch()}
            isRetrying={eventQuery.isFetching}
          />
        ) : (
          <RegistrationBody event={eventQuery.data} />
        )}
      </div>
    </div>
  );
}

function RegistrationBody({ event }: { event: PublicEvent }) {
  const billable = event.days.filter((d) => d.is_billable).map((d) => d.day).sort();
  const open = event.status === 'OPEN' && event.registration_open;

  const [registered, setRegistered] = useState<{ result: RegisterResponse; email: string } | null>(null);

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{event.name}</h1>
        <p className="text-sm text-muted-foreground">Vendor registration</p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-5 text-sm">
          {event.venue && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 flex-none text-muted-foreground" /> {event.venue}
            </p>
          )}
          <p className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 flex-none text-muted-foreground" />
            {billable.length > 0
              ? `${formatDay(billable[0])} to ${formatDay(billable[billable.length - 1])} (${billable.length} trading day${billable.length === 1 ? '' : 's'})`
              : 'Event dates to be announced'}
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Food stalls</p>
              <p className="font-semibold tabular-nums">{formatCents(event.food_day_rate_cents)} <span className="text-xs font-normal text-muted-foreground">per day</span></p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Clothing stalls</p>
              <p className="font-semibold tabular-nums">{formatCents(event.clothing_day_rate_cents)} <span className="text-xs font-normal text-muted-foreground">per day</span></p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Prices include VAT. You choose and pay for your days after you register.</p>
        </CardContent>
      </Card>

      {registered ? (
        <CheckYourEmail result={registered.result} email={registered.email} />
      ) : !open ? (
        <Card>
          <CardHeader>
            <CardTitle>Registration is closed</CardTitle>
            <CardDescription>
              This event is not taking new vendor registrations right now. If you have already registered, you can log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/login">Go to login</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <RegistrationForm slug={event.slug} onDone={setRegistered} />
      )}
    </>
  );
}

function CheckYourEmail({ result, email }: { result: RegisterResponse; email: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5 text-success" /> Check your email
        </CardTitle>
        <CardDescription data-testid="check-email">
          If <strong className="break-all">{email}</strong> can be used, we have sent it a link to confirm your
          email and finish registering. The link works once and expires in 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You can log in and set up your stall before confirming, but you cannot record payments or sell until your
          email is confirmed. Your business code is in the email too.
        </p>
        <p className="text-sm" data-testid="login-opens">
          {result.login_opens_on
            ? <>You can log in from <strong>{formatDay(result.login_opens_on)}</strong>.</>
            : <>You can log in <strong>now</strong>.</>}
        </p>
        <ResendVerificationButton email={email} className="w-full" />
        <Button asChild variant="secondary" className="w-full">
          <Link to="/login">Go to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RegistrationForm({ slug, onDone }: {
  slug: string;
  onDone: (r: { result: RegisterResponse; email: string }) => void;
}) {
  const [registrationCode, setRegistrationCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState<EventCategory>('FOOD');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  const pwProblem = password ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;

  const register = useMutation({
    mutationFn: (body: RegisterRequest) =>
      apiClient.post<RegisterResponse>(`/v1/public/events/${encodeURIComponent(slug)}/register`, body),
    onSuccess: (data, body) => {
      // Drop the secrets before the success view replaces the form.
      setPassword('');
      setConfirm('');
      onDone({ result: data, email: body.owner_email });
    },
    onError: (err) => setError(registrationErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    if (!accepted) return setError('Please accept the terms to continue.');
    register.mutate({
      registration_code: registrationCode.trim(),
      business_name: businessName.trim(),
      category,
      owner_full_name: ownerName.trim(),
      owner_email: email.trim(),
      password,
      accept_terms: true,
    });
  };

  const canSubmit =
    !!registrationCode.trim() && businessName.trim().length >= 2 && !!ownerName.trim() && !!email.trim() &&
    password.length > 0 && confirm.length > 0 && accepted && !register.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register your stall</CardTitle>
        <CardDescription>Use the registration code the organiser gave you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reg-code">Registration code</Label>
            <Input id="reg-code" value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value)}
              maxLength={64} autoComplete="off" autoCapitalize="characters" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-business">Business / stall name</Label>
            <Input id="reg-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              maxLength={255} autoComplete="organization" required />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">What do you sell?</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['FOOD', 'CLOTHING'] as const).map((c) => (
                <label
                  key={c}
                  className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${category === c ? 'border-primary bg-primary/5' : ''}`}
                >
                  <input type="radio" name="category" value={c} checked={category === c}
                    onChange={() => setCategory(c)} />
                  {c === 'FOOD' ? 'Food' : 'Clothing'}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="reg-owner">Your full name</Label>
            <Input id="reg-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
              maxLength={255} autoComplete="name" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">Email address</Label>
            <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required />
            <p className="text-xs text-muted-foreground">You will log in with this email.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" aria-invalid={!!pwProblem} required />
            {pwProblem ? (
              <p className="text-xs text-destructive">{pwProblem}</p>
            ) : (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-confirm">Confirm password</Label>
            <Input id="reg-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" aria-invalid={mismatch} required />
            {mismatch && <p className="text-xs text-destructive">The two passwords do not match.</p>}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox id="reg-terms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
            <Label htmlFor="reg-terms" className="text-sm font-normal leading-snug">
              I accept the NextGen terms of use for event vendors.
            </Label>
          </div>

          <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

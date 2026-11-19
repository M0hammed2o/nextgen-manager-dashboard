import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { tokenFromLocation, verifyErrorMessage, type VerifyEmailResponse } from '@/lib/souk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResendVerificationButton } from '@/components/shared/ResendVerificationButton';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

type State =
  | { kind: 'verifying' }
  | { kind: 'done'; result: VerifyEmailResponse }
  | { kind: 'failed'; message: string };

/**
 * Public landing page for the verification link (`/verify-email#token=...`).
 * Spends the token once with POST /v1/public/auth/verify-email, then guides
 * the vendor to log in. The token is removed from the address bar straight
 * away so it does not stay in browser history. Invalid, expired and already
 * used links get the same message (the backend answers them identically),
 * with a resend form.
 */
export default function VerifyEmailPage() {
  const location = useLocation();
  const [token] = useState(() => tokenFromLocation(location.hash, location.search));
  const [state, setState] = useState<State>(() => (token
    ? { kind: 'verifying' }
    : { kind: 'failed', message: 'This page needs the link from your verification email. Request a new one below.' }));
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // StrictMode runs effects twice; a token works only once
    started.current = true;
    try {
      window.history.replaceState(null, '', location.pathname);
    } catch { /* not fatal */ }
    apiClient.post<VerifyEmailResponse>('/v1/public/auth/verify-email', { token })
      .then((result) => setState({ kind: 'done', result }))
      .catch((err) => setState({ kind: 'failed', message: verifyErrorMessage(err) }));
  }, [token, location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md space-y-6 p-4 py-8 sm:p-6">
        <div className="flex items-center gap-3">
          <img src={logoNextgen} alt="NextGen Intelligence" className="h-10 w-10 rounded-lg object-cover" />
          <span className="text-sm font-semibold text-foreground">NextGen Intelligence</span>
        </div>
        {state.kind === 'verifying' && (
          <Card>
            <CardContent className="flex items-center gap-3 py-8" data-testid="verify-pending">
              <Loader2 className="h-5 w-5 animate-spin" /> Confirming your email...
            </CardContent>
          </Card>
        )}
        {state.kind === 'done' && <Verified result={state.result} />}
        {state.kind === 'failed' && <Failed message={state.message} />}
      </div>
    </div>
  );
}

function Verified({ result }: { result: VerifyEmailResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" /> Email confirmed
        </CardTitle>
        <CardDescription>
          Thank you. Log in with your email and password. Selling opens on the days you have paid for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.business_code && (
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">Your business code</p>
            <p className="mt-1 break-all font-mono text-2xl font-bold tracking-wider" data-testid="business-code">
              {result.business_code}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Keep this code. NextGen will ask for it if you ever need support with your account.
            </p>
          </div>
        )}
        <Button asChild className="w-full">
          <Link to="/login">Go to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Failed({ message }: { message: string }) {
  const [email, setEmail] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailWarning className="h-5 w-5 text-warning" /> We could not confirm your email
        </CardTitle>
        <CardDescription role="alert">{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="resend-email">Your email address</Label>
          <Input id="resend-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" />
        </div>
        <ResendVerificationButton email={email} className="w-full" />
        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">Go to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

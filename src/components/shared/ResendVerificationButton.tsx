import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Mail } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { RESEND_COOLDOWN_SECONDS, type ResendVerificationResponse } from '@/lib/souk';
import { Button } from '@/components/ui/button';

/**
 * "Resend verification email" with a client-side cooldown. Calls
 * POST /v1/public/auth/resend-verification, which answers the same 202
 * whether or not the email exists, is already verified or was throttled, so
 * this never says whether an email was actually sent. The backend enforces
 * its own per-email cooldown and hourly cap; the countdown here only stops
 * pointless clicks.
 */
export function ResendVerificationButton({
  email, variant = 'outline', className,
}: { email: string; variant?: 'outline' | 'default' | 'secondary'; className?: string }) {
  const [remaining, setRemaining] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const resend = useMutation({
    mutationFn: () => apiClient.post<ResendVerificationResponse>('/v1/public/auth/resend-verification',
      { email: email.trim() }),
    onSuccess: () => {
      setNote('If this email still needs confirming, a new link is on its way. Check your inbox and spam folder.');
      setRemaining(RESEND_COOLDOWN_SECONDS);
    },
    onError: (err) => {
      setNote(err instanceof ApiError && err.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : err instanceof ApiError && err.status === 422
          ? 'Enter a valid email address.'
          : 'We could not send that request. Check your connection and try again.');
      setRemaining(err instanceof ApiError && err.status === 429 ? RESEND_COOLDOWN_SECONDS : 0);
    },
  });

  const disabled = !email.trim() || remaining > 0 || resend.isPending;
  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} className={className} disabled={disabled} onClick={() => resend.mutate()}>
        {resend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {remaining > 0 ? `Resend in ${remaining}s` : 'Resend verification email'}
      </Button>
      {note && <p role="status" className="text-xs text-muted-foreground" data-testid="resend-note">{note}</p>}
    </div>
  );
}

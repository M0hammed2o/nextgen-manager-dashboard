import { MailWarning } from 'lucide-react';
import type { EmailVerificationStatus } from '@/lib/souk';
import { ResendVerificationButton } from '@/components/shared/ResendVerificationButton';

/**
 * Shown to a self-registered event vendor whose owner email is not confirmed
 * yet (GET /v1/business/event-access -> email_verification). They can set up
 * their stall, but the backend refuses selling (EMAIL_NOT_VERIFIED) and EFT
 * payment claims until the email is confirmed. Renders nothing otherwise
 * (restaurants and admin-onboarded vendors never need it).
 */
export function EmailVerificationBanner({
  status, email,
}: { status: EmailVerificationStatus | undefined; email: string | null | undefined }) {
  if (!status || !status.required || status.verified) return null;
  return (
    <div role="status" data-testid="email-verification-banner"
      className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <MailWarning className="h-5 w-5 flex-none" />
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-semibold">Confirm your email address</p>
        <p>
          We sent a link to {email ? <strong className="break-all">{email}</strong> : 'your email address'}.
          You can set up your stall now, but you cannot record payments or sell until it is confirmed.
        </p>
        {email && <ResendVerificationButton email={email} />}
      </div>
    </div>
  );
}

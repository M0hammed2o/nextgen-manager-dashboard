import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { EventWhatsAppStatus } from '@/lib/souk';

/**
 * Optional WhatsApp set-up for a souk event vendor (souk WhatsApp gate).
 * Every status comes from GET /v1/business/event-access; nothing is guessed
 * here, and nothing on this card talks to Meta. Connecting reuses the existing
 * WhatsApp connection page (Embedded Signup with the vendor's own number).
 */
const STATUS: Record<EventWhatsAppStatus['state'], { label: string; detail: string }> = {
  AWAITING_ADMIN_APPROVAL: {
    label: 'Not connected: awaiting NextGen approval',
    detail: 'WhatsApp is switched off for your stall. Ask NextGen to approve WhatsApp for your stall first.',
  },
  NOT_CONNECTED: {
    label: 'Approved: connect your own WhatsApp number',
    detail: 'Connect your own WhatsApp Business number. Add a payment method to your WhatsApp Business account in Meta: Meta bills you directly for messages.',
  },
  TEMPLATE_PENDING: {
    label: 'Connected: order-ready template pending',
    detail: 'Submit the template below in your WhatsApp Manager. Once Meta approves it, tell NextGen so we can confirm it.',
  },
  READY: {
    label: 'Ready',
    detail: 'Customers who agree at the till get one WhatsApp message when their order is ready.',
  },
};

export function EventWhatsAppCard({ whatsapp }: { whatsapp: EventWhatsAppStatus }) {
  const status = STATUS[whatsapp.state];
  const t = whatsapp.suggested_template;
  const ready = whatsapp.state === 'READY';
  const Icon = ready ? CheckCircle2 : whatsapp.state === 'TEMPLATE_PENDING' ? Clock : Circle;
  return (
    <Card data-testid="event-whatsapp-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 flex-none text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">WhatsApp (optional)</p>
              <p className={`flex items-center gap-1.5 text-sm ${ready ? 'text-success' : 'text-muted-foreground'}`}>
                <Icon className="h-4 w-4" aria-hidden /> <span data-testid="event-whatsapp-status">{status.label}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{status.detail}</p>
            </div>
          </div>
          {whatsapp.state === 'NOT_CONNECTED' && (
            <Button asChild className="min-h-11 w-full sm:w-auto">
              <Link to="/settings/whatsapp">Connect WhatsApp <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          )}
        </div>

        {(whatsapp.state === 'TEMPLATE_PENDING' || whatsapp.state === 'NOT_CONNECTED') && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="event-whatsapp-template">
            <p className="font-medium">Order-ready template to submit in WhatsApp Manager</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Name</dt><dd className="font-mono">{t.name}</dd>
              <dt className="text-muted-foreground">Category</dt><dd>{t.category === 'UTILITY' ? 'Utility' : t.category}</dd>
              <dt className="text-muted-foreground">Language</dt><dd className="font-mono">{t.language}</dd>
              <dt className="text-muted-foreground">Body</dt><dd className="font-mono break-words">{t.body}</dd>
            </dl>
            <p className="mt-2 text-muted-foreground">
              {'{{1}}'} is the order number, {'{{2}}'} your trading name, {'{{3}}'} your stall and event. No links or buttons.
              {whatsapp.template_name && !whatsapp.template_approved
                ? ` Recorded so far: ${whatsapp.template_name}, waiting for NextGen to confirm Meta approved it.`
                : ''}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          WhatsApp ordering only opens on the days you have paid for. On other days customers are told you are not
          taking WhatsApp orders, and nothing is ordered or charged.
        </p>
      </CardContent>
    </Card>
  );
}

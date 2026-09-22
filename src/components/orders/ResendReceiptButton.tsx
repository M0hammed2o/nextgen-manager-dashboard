import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Order, ReceiptResendResponse } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * OWNER/MANAGER-only action in the manager dashboard's Order Detail dialog:
 * force-resend an order's digital receipt over WhatsApp
 * (backend/app/api/v1/routes_orders.py POST /{order_id}/receipt/resend).
 *
 * Independent of payment/reversal state — this never touches the sale
 * itself, only the delivery of a document about it, so it stays available
 * regardless of what OrderReversalPanel shows for the same order. The
 * backend also enforces OWNER/MANAGER-only; the role check here is a UX
 * courtesy (hides the control for STAFF), not the security boundary.
 */
export default function ResendReceiptButton({ order, role }: { order: Order; role: string }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(order.phone_number ?? '');
  const isManager = role === 'OWNER' || role === 'MANAGER';

  const resendMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiClient.post<ReceiptResendResponse>(`/v1/business/orders/${order.id}/receipt/resend`, {
        phone_number: phoneNumber || undefined,
      }),
    onSuccess: (res) => {
      if (res.whatsapp_status === 'FAILED') {
        toast({
          title: 'Receipt could not be sent',
          description: res.whatsapp_failure_reason ?? 'The WhatsApp message failed to send.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Digital receipt sent', description: 'Resent over WhatsApp.' });
      }
    },
    onError: (err: Error) =>
      toast({ title: 'Could not resend receipt', description: err.message, variant: 'destructive' }),
  });

  if (!isManager) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-sm font-semibold text-foreground">Resend digital receipt</p>
      <div className="flex gap-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number (optional — uses the order's own if blank)"
          className="text-sm"
          aria-label="Phone number for digital receipt resend"
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() => resendMutation.mutate(phone.trim())}
          disabled={resendMutation.isPending}
        >
          {resendMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Resend
        </Button>
      </div>
    </div>
  );
}

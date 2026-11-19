import { Copy, KeyRound } from 'lucide-react';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

/**
 * Read-only store (business) code, which staff type into the staff app before
 * choosing their name and PIN. Comes from GET /v1/business/settings, which is
 * owner/manager-only and scoped to the business in the caller's JWT, so this
 * only ever shows the signed-in user's own code. Renders nothing until the
 * code is known (and nothing on error: it is a convenience, not a gate).
 */
export function StoreCodeCard({ className }: { className?: string }) {
  const settings = useBusinessSettings();
  const { toast } = useToast();
  const code = settings.data?.business_code;
  if (!code) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Store code copied' });
    } catch {
      toast({ title: 'Could not copy', description: 'Select the code and copy it by hand.', variant: 'destructive' });
    }
  };

  return (
    <Card className={className} data-testid="store-code-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 flex-none text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Store code for the staff app</p>
            <p className="select-all break-all font-mono text-2xl font-bold tracking-wider" data-testid="store-code">{code}</p>
            <p className="text-xs text-muted-foreground">
              Staff enter this code once on each till device, then pick their name and enter their PIN.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={copy} aria-label="Copy store code">
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy
        </Button>
      </CardContent>
    </Card>
  );
}

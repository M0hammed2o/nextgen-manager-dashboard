import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCents, formatDateTime } from '@/lib/mappers';
import {
  OFFLINE_FLAGGED_KEY, OFFLINE_REVIEWS_KEY, buildLateUploadsPath, lateUploadDecisionPath,
  reasonChipLabel, reasonExplanation,
  type LateUpload, type LateUploadList,
} from '@/lib/offline-review';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type Decision = 'approve' | 'reject';

const NOTE_MAX = 1000;

/**
 * Late uploads awaiting review (BUG-0208). Offline sales uploaded after the automatic
 * time limit (36h for event stalls, 72h otherwise) are held by the server instead of
 * being refused. A pending one has changed NO money, stock or till yet. Approving
 * records the sale through the normal checks (paid event day, server price, staff
 * discount limits); rejecting records nothing. A note is required either way. Owners
 * and managers can decide; the server enforces the role and the business.
 */
export function LateUploadsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<{ upload: LateUpload; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [OFFLINE_REVIEWS_KEY, 'list'],
    queryFn: () => apiClient.get<LateUploadList>(buildLateUploadsPath('PENDING')),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, text }: { id: string; decision: Decision; text: string }) =>
      apiClient.post(lateUploadDecisionPath(id, decision), { note: text }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: [OFFLINE_REVIEWS_KEY] });
      // An approved upload becomes a flagged order ("Late upload approved").
      queryClient.invalidateQueries({ queryKey: [OFFLINE_FLAGGED_KEY] });
      toast({ title: vars.decision === 'approve' ? 'Sale approved and recorded' : 'Upload rejected' });
      close();
    },
    onError: (err: Error) => {
      const decided = err instanceof ApiError && err.code === 'OFFLINE_REVIEW_ALREADY_DECIDED';
      toast({
        title: decided ? 'Someone already decided this upload' : 'Could not save the decision',
        description: err.message,
        variant: 'destructive',
      });
      if (decided) {
        queryClient.invalidateQueries({ queryKey: [OFFLINE_REVIEWS_KEY] });
        close();
      }
    },
  });

  function open(upload: LateUpload, decision: Decision) {
    setTarget({ upload, decision });
    setNote('');
    setNoteError(null);
  }
  function close() {
    setTarget(null);
    setNote('');
    setNoteError(null);
  }
  function submit() {
    const text = note.trim();
    if (!text) {
      setNoteError('A note is required.');
      return;
    }
    if (target) decide.mutate({ id: target.upload.id, decision: target.decision, text });
  }

  const items = data?.items ?? [];

  return (
    <section aria-labelledby="late-uploads-heading" className="space-y-3" data-testid="late-uploads-section">
      <div>
        <h2 id="late-uploads-heading" className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5" /> Late uploads awaiting review
          {data && data.pending_count > 0 && <Badge variant="secondary">{data.pending_count}</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          Offline sales uploaded after the automatic time limit. Nothing has been recorded for these yet: approve
          to record the sale (normal price and limit checks apply), or reject to record nothing.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading late uploads…
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load late uploads.{' '}
          <button className="underline" onClick={() => refetch()} disabled={isFetching} aria-label="Retry loading late uploads">
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="late-uploads-empty">No late uploads are waiting.</p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4 font-medium">Sale</th>
                <th className="p-4 font-medium">Captured / uploaded</th>
                <th className="p-4 font-medium">Cashier</th>
                <th className="p-4 font-medium text-right">Device total</th>
                <th className="p-4 font-medium">Notes</th>
                <th className="p-4 font-medium text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 align-top" data-testid="late-upload-row">
                  <td className="p-4 text-foreground">
                    <ul className="space-y-0.5">
                      {u.lines.map((l, i) => (
                        <li key={`${l.menu_item_id}-${i}`}>{l.quantity} × {l.name ?? 'Item no longer on the menu'}</li>
                      ))}
                    </ul>
                    <div className="text-xs text-muted-foreground">
                      {u.payment_method ?? 'Payment'}{u.discount_cents > 0 ? ` · discount ${formatCents(u.discount_cents)}` : ''}
                    </div>
                  </td>
                  <td className="p-4 text-foreground">
                    <div>{formatDateTime(u.captured_at)}</div>
                    <div className="text-xs text-muted-foreground">Uploaded {formatDateTime(u.received_at)}</div>
                  </td>
                  <td className="p-4 text-foreground">
                    <div>{u.captured_by_name || 'Staff member'}</div>
                    {u.synced_by_user_id !== u.captured_by_user_id && (
                      <div className="text-xs text-muted-foreground">Uploaded by {u.synced_by_name || 'staff member'}</div>
                    )}
                  </td>
                  <td className="p-4 text-right text-foreground">
                    {u.client_total_cents != null ? formatCents(u.client_total_cents) : '—'}
                    <div className="text-xs text-muted-foreground">Server re-prices on approval</div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {u.upload_review_reasons.map((r) => (
                        <Badge key={r} variant="outline" title={reasonExplanation(r)}>{reasonChipLabel(r)}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => open(u, 'approve')} disabled={decide.isPending}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => open(u, 'reject')} disabled={decide.isPending}>
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(o) => { if (!o && !decide.isPending) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.decision === 'approve' ? 'Approve this late sale?' : 'Reject this late upload?'}</DialogTitle>
            <DialogDescription>
              {target?.decision === 'approve'
                ? 'The sale is recorded now, at the time it was made, with the system price. It will show in the offline sales list as a late upload you approved.'
                : 'Nothing is recorded: no order, no stock change, no cash. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="late-upload-note">Note (required)</Label>
            <Textarea
              id="late-upload-note"
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => { setNote(e.target.value); if (noteError) setNoteError(null); }}
              placeholder={target?.decision === 'approve' ? 'e.g. matches the paper tally for Sunday' : 'e.g. already entered by hand'}
              aria-invalid={!!noteError}
            />
            {noteError && <p className="text-sm text-destructive" role="alert">{noteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={decide.isPending}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={decide.isPending}
              variant={target?.decision === 'reject' ? 'destructive' : 'default'}
            >
              {decide.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {target?.decision === 'approve' ? 'Approve and record' : 'Reject upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

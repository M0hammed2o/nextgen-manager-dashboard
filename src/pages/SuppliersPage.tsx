import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/mappers';
import { supplierDeleteEligibility } from '@/lib/supplier-delete';
import type { Supplier } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Truck, Plus, Pencil, Ban, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Suppliers — reference data that a goods receipt attributes a delivery to.
 *
 * There was no supplier management UI at all before this page, despite
 * create+list having existed on the backend for a long time (see
 * WORKLOG.md 2026-09-23 "NextGen Operations gap-closure").
 *
 * DELETE RULE, SURFACED HONESTLY
 * --------------------------------
 * The backend only permits a permanent delete when a supplier has ZERO
 * goods receipts on record AND is already deactivated
 * (routes_inventory.py `delete_supplier`) — a hard delete must never orphan
 * historical goods-received data. `supplierDeleteEligibility` (shared with
 * this page's own test) mirrors that rule so a Delete action is only ever
 * offered where it can actually succeed; Deactivate is always available and
 * is the obvious primary action for anything still in use.
 */
export default function SuppliersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['suppliers', includeInactive],
    queryFn: () =>
      apiClient.get<Supplier[]>(
        `/v1/business/inventory/suppliers?include_inactive=${includeInactive}`
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiClient.patch<Supplier>(`/v1/business/inventory/suppliers/${id}`, { is_active }),
    onSuccess: (_result, variables) => {
      invalidate();
      toast({ title: variables.is_active ? 'Supplier reactivated' : 'Supplier deactivated' });
      setDeactivateTarget(null);
    },
    onError: (err: Error) =>
      toast({ title: 'Could not update supplier', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/v1/business/inventory/suppliers/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Supplier permanently deleted' });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      // The backend re-verifies the same eligibility rule server-side, so a
      // 409 here means the picture changed since this page last loaded (e.g.
      // a goods receipt was recorded against this supplier moments ago) —
      // refresh so the UI reflects why, rather than leaving a stale Delete
      // button that will keep failing the same way.
      invalidate();
      toast({ title: 'Could not delete supplier', description: err.message, variant: 'destructive' });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const apiError = error as ApiError;
    if (apiError.code === 'INVENTORY_NOT_ENABLED' || apiError.message?.toLowerCase().includes('not enabled')) {
      return (
        <div className="space-y-4">
          <PageHeader title="Suppliers" />
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <PageHeader title="Suppliers" />
        <ErrorState message={apiError.message} onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  const rows = suppliers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Suppliers" description="Who your deliveries come from." />
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add supplier
        </Button>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="h-4 w-4"
        />
        Show deactivated suppliers
      </label>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-12 h-12" />}
          title={includeInactive ? 'No suppliers yet' : 'No active suppliers'}
          description={
            includeInactive
              ? 'Add a supplier to attribute deliveries to when you record a goods receipt.'
              : 'Add a supplier, or tick "Show deactivated suppliers" to see ones you\'ve turned off.'
          }
          action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="mr-2 h-4 w-4" /> Add supplier</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Goods receipts</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const eligibility = supplierDeleteEligibility(s);
                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.contact_name && <div>{s.contact_name}</div>}
                          {s.phone && <div className="text-xs">{s.phone}</div>}
                          {s.email && <div className="text-xs">{s.email}</div>}
                          {!s.contact_name && !s.phone && !s.email && '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {s.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.goods_receipt_count > 0 ? (
                            <>
                              {s.goods_receipt_count}
                              {s.last_received_at && (
                                <span className="block text-xs">last {formatDate(s.last_received_at)}</span>
                              )}
                            </>
                          ) : (
                            'None yet'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title="Edit details"
                              onClick={() => { setEditing(s); setShowForm(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {s.is_active ? (
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                title="Deactivate — the safe default; stops new deliveries being attributed to them"
                                onClick={() => setDeactivateTarget(s)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                title="Reactivate"
                                onClick={() => toggleActiveMutation.mutate({ id: s.id, is_active: true })}
                                disabled={toggleActiveMutation.isPending}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {eligibility.canDelete && (
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                title="Permanently delete"
                                onClick={() => setDeleteTarget(s)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit supplier' : 'Add supplier'}</DialogTitle></DialogHeader>
          <SupplierForm supplier={editing} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={() => setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll stop appearing in the active supplier list and delivery picker. Every past
              goods receipt attributed to them is untouched, and you can reactivate them any time
              from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && toggleActiveMutation.mutate({ id: deactivateTarget.id, is_active: false })}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone — their record is completely removed, not just deactivated.
              Only offered because they have no goods receipts on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(supplier?.name ?? '');
  const [contactName, setContactName] = useState(supplier?.contact_name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');

  const mutation = useMutation({
    mutationFn: (body: { name?: string; contact_name: string | null; phone: string | null; email: string | null }) =>
      supplier
        ? apiClient.patch<Supplier>(`/v1/business/inventory/suppliers/${supplier.id}`, body)
        : apiClient.post<Supplier>('/v1/business/inventory/suppliers', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: supplier ? 'Supplier updated' : 'Supplier added' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Enter a supplier name', variant: 'destructive' });
      return;
    }
    mutation.mutate({
      name: trimmedName,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Supplier name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Contact name</Label>
        <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Who to ask for" />
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {supplier ? 'Save changes' : 'Add supplier'}
        </Button>
      </div>
    </form>
  );
}

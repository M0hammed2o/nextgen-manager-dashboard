import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { PROVIDER_LABELS } from '@/lib/delivery';
import type {
  DeliveryMappingResponse, DeliveryMappingKind, DeliveryMappingStatus,
  DeliveryMappingUpsertRequest, DeliveryProvider, MenuItem, MenuAddOn,
} from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { DeliverySubNav } from '@/components/delivery/DeliverySubNav';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ListChecks, Plus, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const KIND_OPTIONS: { value: DeliveryMappingKind; label: string }[] = [
  { value: 'ITEM', label: 'Menu item' },
  { value: 'MODIFIER', label: 'Modifier / option / add-on' },
];

const STATUS_VARIANT: Record<DeliveryMappingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  MAPPED: 'default',
  UNMAPPED: 'destructive',
  CHANGED: 'destructive',
  INVALID: 'destructive',
  IGNORED: 'outline',
};

const STATUS_LABEL: Record<DeliveryMappingStatus, string> = {
  MAPPED: 'Mapped',
  UNMAPPED: 'Unmapped — needs attention',
  CHANGED: 'Changed on provider — re-check',
  INVALID: 'Invalid — needs attention',
  IGNORED: "Ignored (doesn't affect stock)",
};

interface MappingFormState {
  platform: DeliveryProvider;
  kind: DeliveryMappingKind;
  external_id: string;
  external_text: string;
  menu_item_id: string;
  menu_add_on_id: string;
  option_id: string;
  removable_ref_id: string;
  is_ignored: boolean;
}

function emptyForm(overrides?: Partial<MappingFormState>): MappingFormState {
  return {
    platform: 'UBER_EATS',
    kind: 'ITEM',
    external_id: '',
    external_text: '',
    menu_item_id: '',
    menu_add_on_id: '',
    option_id: '',
    removable_ref_id: '',
    is_ignored: false,
    ...overrides,
  };
}

function MappingDialog({
  open, onClose, initial, menuItems, addOns,
}: {
  open: boolean;
  onClose: () => void;
  initial: MappingFormState;
  menuItems: MenuItem[];
  addOns: MenuAddOn[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MappingFormState>(initial);

  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial.external_id, initial.platform]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: DeliveryMappingUpsertRequest = {
        platform: form.platform,
        kind: form.kind,
        external_id: form.external_id.trim(),
        external_text: form.external_text.trim(),
        is_ignored: form.is_ignored,
        menu_item_id: form.kind === 'ITEM' && form.menu_item_id ? form.menu_item_id : undefined,
        menu_add_on_id: form.kind === 'MODIFIER' && form.menu_add_on_id ? form.menu_add_on_id : undefined,
        option_id: form.kind === 'MODIFIER' && form.option_id.trim() ? form.option_id.trim() : undefined,
        removable_ref_id: form.kind === 'MODIFIER' && form.removable_ref_id.trim() ? form.removable_ref_id.trim() : undefined,
      };
      return apiClient.post<DeliveryMappingResponse>('/v1/business/delivery/menu-mappings', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-menu-mappings'] });
      toast({ title: 'Mapping saved' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Could not save mapping', description: err.message, variant: 'destructive' });
    },
  });

  const canSave =
    form.external_id.trim().length > 0 &&
    form.external_text.trim().length > 0 &&
    (form.is_ignored ||
      (form.kind === 'ITEM' && !!form.menu_item_id) ||
      (form.kind === 'MODIFIER' && (form.menu_add_on_id || form.option_id.trim() || form.removable_ref_id.trim())));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Map a delivery item</DialogTitle>
          <DialogDescription>
            Point an exact provider item/modifier at what it means on your NextGen menu, so future orders resolve automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v as DeliveryProvider }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UBER_EATS">Uber Eats</SelectItem>
                  <SelectItem value="MR_D">Mr D</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as DeliveryMappingKind }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Provider item ID <span className="text-xs text-muted-foreground font-normal">(exact id from the provider)</span></Label>
            <Input value={form.external_id} onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Provider item name</Label>
            <Input value={form.external_text} onChange={(e) => setForm((f) => ({ ...f, external_text: e.target.value }))} placeholder="e.g. Large Margherita Pizza" />
          </div>

          <label className="flex items-center gap-2 text-sm pt-1">
            <Checkbox checked={form.is_ignored} onCheckedChange={(v) => setForm((f) => ({ ...f, is_ignored: v === true }))} />
            Doesn't affect stock (don't map to anything)
          </label>

          {!form.is_ignored && form.kind === 'ITEM' && (
            <div className="space-y-1.5">
              <Label>NextGen menu item</Label>
              <Select value={form.menu_item_id} onValueChange={(v) => setForm((f) => ({ ...f, menu_item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a menu item" /></SelectTrigger>
                <SelectContent>
                  {menuItems.map((mi) => <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!form.is_ignored && form.kind === 'MODIFIER' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>NextGen add-on <span className="text-xs text-muted-foreground font-normal">(most modifiers)</span></Label>
                <Select value={form.menu_add_on_id || 'NONE'} onValueChange={(v) => setForm((f) => ({ ...f, menu_add_on_id: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose an add-on" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {addOns.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Advanced: size option / removable ingredient</summary>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Option ID</Label>
                    <Input value={form.option_id} onChange={(e) => setForm((f) => ({ ...f, option_id: e.target.value }))} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Removable ingredient ID</Label>
                    <Input value={form.removable_ref_id} onChange={(e) => setForm((f) => ({ ...f, removable_ref_id: e.target.value }))} className="font-mono text-xs" />
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Saving…' : 'Save mapping'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryMappingsPage() {
  const { data: settings, isLoading: settingsLoading } = useBusinessSettings();
  const deliveryEnabledConfirmed = settings?.delivery_platforms_enabled === true;
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    data: mappings, isLoading, isError, isFetching, refetch,
  } = useQuery({
    queryKey: ['delivery-menu-mappings'],
    queryFn: () => apiClient.get<DeliveryMappingResponse[]>('/v1/business/delivery/menu-mappings'),
    enabled: deliveryEnabledConfirmed,
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => apiClient.get<MenuItem[]>('/v1/business/menu/items'),
    enabled: deliveryEnabledConfirmed,
  });
  const { data: addOns = [] } = useQuery({
    queryKey: ['menu-add-ons'],
    queryFn: () => apiClient.get<MenuAddOn[]>('/v1/business/menu/add-ons'),
    enabled: deliveryEnabledConfirmed,
  });

  const [dialogState, setDialogState] = useState<{ open: boolean; initial: MappingFormState }>({
    open: false, initial: emptyForm(),
  });

  // Deep link from the Orders page's "Map this item" button
  // (?platform=...&external_id=...&external_text=...) — auto-opens the
  // dialog pre-filled so a manager can close the NEEDS_MAPPING loop without
  // re-typing the exact provider item id/name.
  useEffect(() => {
    const platform = searchParams.get('platform');
    const externalId = searchParams.get('external_id');
    if (platform && externalId) {
      setDialogState({
        open: true,
        initial: emptyForm({
          platform: platform as DeliveryProvider,
          external_id: externalId,
          external_text: searchParams.get('external_text') ?? '',
        }),
      });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedMappings = useMemo(() => {
    if (!mappings) return [];
    // Unmapped/invalid/changed first — that's the operationally urgent set.
    const urgency: Record<DeliveryMappingStatus, number> = { UNMAPPED: 0, INVALID: 0, CHANGED: 1, MAPPED: 2, IGNORED: 3 };
    return [...mappings].sort((a, b) => urgency[a.status] - urgency[b.status]);
  }, [mappings]);

  if (settingsLoading) return <PageSkeleton />;

  if (!deliveryEnabledConfirmed) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Menu Mapping</h1></div>
        <EmptyState
          icon={<Truck className="w-10 h-10" />}
          title="Delivery marketplace isn't enabled for this business"
          description="Contact NextGen support to switch on the Delivery Marketplace module."
        />
      </div>
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (isError || !mappings) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Menu Mapping</h1></div>
        <ErrorState message="Couldn't load menu mappings." onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  const urgentCount = mappings.filter((m) => m.status === 'UNMAPPED' || m.status === 'INVALID' || m.status === 'CHANGED').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Menu Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Point each provider item/modifier at what it means on your NextGen menu. An order containing an unmapped
            item cannot be processed and will be auto-declined at the provider's deadline.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setDialogState({ open: true, initial: emptyForm() })}>
          <Plus className="w-4 h-4" /> Add mapping
        </Button>
      </div>
      <DeliverySubNav />

      {urgentCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {urgentCount} mapping{urgentCount === 1 ? '' : 's'} need{urgentCount === 1 ? 's' : ''} attention.
        </div>
      )}

      {sortedMappings.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="w-10 h-10" />}
          title="No mappings yet"
          description="Mappings are created automatically as unmapped items are found in orders, or you can add one manually."
          action={<Button className="gap-1.5" onClick={() => setDialogState({ open: true, initial: emptyForm() })}><Plus className="w-4 h-4" /> Add mapping</Button>}
        />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Provider item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mapped to</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMappings.map((m) => (
                <TableRow key={m.id} className={m.status === 'UNMAPPED' || m.status === 'INVALID' ? 'bg-destructive/5' : undefined}>
                  <TableCell>{PROVIDER_LABELS[m.platform]}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.kind}</TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{m.external_text}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.external_id}</p>
                  </TableCell>
                  <TableCell><StatusBadge label={STATUS_LABEL[m.status]} variant={STATUS_VARIANT[m.status]} /></TableCell>
                  <TableCell className="text-sm">
                    {m.menu_item_name ?? m.menu_add_on_name ?? (m.is_ignored ? "Doesn't affect stock" : '—')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialogState({
                        open: true,
                        initial: {
                          platform: m.platform, kind: m.kind, external_id: m.external_id ?? '',
                          external_text: m.external_text, menu_item_id: m.menu_item_id ?? '',
                          menu_add_on_id: m.menu_add_on_id ?? '', option_id: m.option_id ?? '',
                          removable_ref_id: m.removable_ref_id ?? '', is_ignored: m.is_ignored,
                        },
                      })}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MappingDialog
        open={dialogState.open}
        onClose={() => setDialogState((s) => ({ ...s, open: false }))}
        initial={dialogState.initial}
        menuItems={menuItems}
        addOns={addOns}
      />
    </div>
  );
}

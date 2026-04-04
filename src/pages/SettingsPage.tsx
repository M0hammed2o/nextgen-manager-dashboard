import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// Keys MUST be 3-letter lowercase — backend reads "mon","tue",... in is_business_open()
// and hours_response(). Using full day names was the root cause of every day showing "Closed".
const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

// Only the fields the user can actually edit in the form.
// Read-only server fields (id, slug, plan limits, etc.) are not tracked locally.
type EditableSettings = Pick<BusinessSettings,
  | 'name' | 'timezone' | 'business_hours'
  | 'greeting_text' | 'fallback_text' | 'closed_text'
  | 'order_in_only' | 'delivery_enabled' | 'delivery_fee_cents'
  | 'require_customer_name' | 'require_phone_number' | 'require_delivery_address'
  | 'address' | 'phone' | 'menu_image_url'
>;

const EMPTY_FORM: EditableSettings = {
  name: '',
  timezone: 'Africa/Johannesburg',
  business_hours: {},
  greeting_text: '',
  fallback_text: '',
  closed_text: '',
  order_in_only: false,
  delivery_enabled: false,
  delivery_fee_cents: 0,
  require_customer_name: false,
  require_phone_number: false,
  require_delivery_address: false,
  address: '',
  phone: '',
  menu_image_url: null,
};

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<BusinessSettings>('/v1/business/settings'),
  });

  const [form, setForm] = useState<EditableSettings>(EMPTY_FORM);

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name ?? '',
        timezone: settings.timezone ?? 'Africa/Johannesburg',
        business_hours: settings.business_hours ?? {},
        greeting_text: settings.greeting_text ?? '',
        fallback_text: settings.fallback_text ?? '',
        closed_text: settings.closed_text ?? '',
        order_in_only: settings.order_in_only ?? false,
        delivery_enabled: settings.delivery_enabled ?? false,
        delivery_fee_cents: settings.delivery_fee_cents ?? 0,
        require_customer_name: settings.require_customer_name ?? false,
        require_phone_number: settings.require_phone_number ?? false,
        require_delivery_address: settings.require_delivery_address ?? false,
        address: settings.address ?? '',
        phone: settings.phone ?? '',
        menu_image_url: settings.menu_image_url ?? null,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.put('/v1/business/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Settings saved' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  const updateField = <K extends keyof EditableSettings>(key: K, value: EditableSettings[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // day.key is already the 3-letter key ("mon","tue",...) — this is what gets saved to DB
  const updateHour = (dayKey: string, field: 'open' | 'close', value: string) => {
    const hours = { ...(form.business_hours ?? {}) };
    const existing = hours[dayKey];
    hours[dayKey] = { open: '', close: '', ...(existing ?? {}), [field]: value };
    updateField('business_hours', hours);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Business configuration</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate({
            name: form.name,
            timezone: form.timezone,
            business_hours: form.business_hours,
            greeting_text: form.greeting_text || null,
            fallback_text: form.fallback_text || null,
            closed_text: form.closed_text || null,
            order_in_only: form.order_in_only,
            delivery_enabled: form.delivery_enabled,
            delivery_fee_cents: form.delivery_fee_cents,
            require_customer_name: form.require_customer_name,
            require_phone_number: form.require_phone_number,
            require_delivery_address: form.require_delivery_address,
            address: form.address || null,
            phone: form.phone || null,
            menu_image_url: form.menu_image_url || null,
          })}
          disabled={saveMutation.isPending}
          className="gap-1.5"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </div>

      {/* General */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">General</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={form.name} onChange={e => updateField('name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={form.timezone ?? ''} onChange={e => updateField('timezone', e.target.value)} placeholder="e.g. Africa/Johannesburg" />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={form.address ?? ''} onChange={e => updateField('address', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone ?? ''} onChange={e => updateField('phone', e.target.value)} />
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Business Hours</h3>
        <p className="text-xs text-muted-foreground">Leave both fields blank to mark a day as closed.</p>
        <div className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const dayHours = form.business_hours?.[key];
            const openVal = dayHours?.open ?? '';
            const closeVal = dayHours?.close ?? '';
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-24 text-sm text-foreground">{label}</span>
                <Input
                  type="time"
                  value={openVal}
                  onChange={e => updateHour(key, 'open', e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={closeVal}
                  onChange={e => updateHour(key, 'close', e.target.value)}
                  className="w-32"
                />
                {!openVal && !closeVal && (
                  <span className="text-xs text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Chatbot */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Chatbot Messages</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Greeting Text</Label>
            <Textarea value={form.greeting_text ?? ''} onChange={e => updateField('greeting_text', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fallback Text</Label>
            <Textarea value={form.fallback_text ?? ''} onChange={e => updateField('fallback_text', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Closed Text</Label>
            <Textarea value={form.closed_text ?? ''} onChange={e => updateField('closed_text', e.target.value)} />
          </div>
        </div>
      </section>

      {/* Media */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Media</h3>
        <p className="text-sm text-muted-foreground">Images sent automatically when customers ask for your menu or specials.</p>
        <div className="space-y-2">
          <Label>Menu Image URL</Label>
          <Input
            value={form.menu_image_url ?? ''}
            onChange={e => updateField('menu_image_url', e.target.value || null)}
            placeholder="https://example.com/menu.jpg"
          />
          <p className="text-xs text-muted-foreground">Paste a public image URL. This image is sent when a customer requests the menu via WhatsApp.</p>
        </div>
        {form.menu_image_url && (
          <img src={form.menu_image_url} alt="Menu preview" className="rounded-lg max-h-48 object-contain border border-border" />
        )}
      </section>

      {/* Order & Delivery */}
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Order & Delivery</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Dine-in Only</Label>
            <Switch checked={form.order_in_only ?? false} onCheckedChange={v => updateField('order_in_only', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Delivery Enabled</Label>
            <Switch checked={form.delivery_enabled ?? false} onCheckedChange={v => updateField('delivery_enabled', v)} />
          </div>
          {form.delivery_enabled && (
            <div className="space-y-2">
              <Label>Delivery Fee (cents)</Label>
              <Input
                type="number"
                value={form.delivery_fee_cents ?? 0}
                onChange={e => updateField('delivery_fee_cents', parseInt(e.target.value) || 0)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Require Customer Name</Label>
            <Switch checked={form.require_customer_name ?? false} onCheckedChange={v => updateField('require_customer_name', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Require Phone Number</Label>
            <Switch checked={form.require_phone_number ?? false} onCheckedChange={v => updateField('require_phone_number', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Require Delivery Address</Label>
            <Switch checked={form.require_delivery_address ?? false} onCheckedChange={v => updateField('require_delivery_address', v)} />
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, Receipt, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BusinessSettings {
  name?: string;
  address?: string | null;
  phone?: string | null;
  vat_registered?: boolean;
  vat_number?: string | null;
  vat_rate_basis_points?: number;
  vat_inclusive_pricing?: boolean;
  receipt_paper_width_mm?: number;
  receipt_auto_print?: boolean;
  receipt_copies?: number;
  print_kitchen_receipt?: boolean;
  receipt_config_json?: Record<string, unknown> | null;
}

/**
 * Receipt and VAT settings.
 *
 * The client's existing till slip is a DESIGN REFERENCE, not the thing that
 * gets printed. A thermal head is 1-bit and 384 (58 mm) or 576 (80 mm) dots
 * wide; a photo prints slowly and badly, cannot reflow for a variable number
 * of line items, and would freeze the order number, totals and VAT as
 * pixels. So these fields drive a structured template instead, and the
 * uploaded slip is kept only so we can reproduce its layout faithfully.
 */
export default function ReceiptSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['business-settings'],
    queryFn: () => apiClient.get<BusinessSettings>('/v1/business/settings'),
  });

  const [form, setForm] = useState({
    vat_registered: false,
    vat_number: '',
    vat_rate_percent: '15',
    vat_inclusive_pricing: true,
    receipt_paper_width_mm: 80,
    receipt_auto_print: true,
    receipt_copies: 1,
    print_kitchen_receipt: false,
    trading_name: '',
    franchise_name: '',
    branch_name: '',
    address: '',
    phone: '',
    footer_message: '',
    qr_data: '',
  });

  useEffect(() => {
    if (!data) return;
    const config = (data.receipt_config_json ?? {}) as Record<string, string>;
    setForm({
      vat_registered: data.vat_registered ?? false,
      vat_number: data.vat_number ?? '',
      vat_rate_percent: String((data.vat_rate_basis_points ?? 1500) / 100),
      vat_inclusive_pricing: data.vat_inclusive_pricing ?? true,
      receipt_paper_width_mm: data.receipt_paper_width_mm ?? 80,
      receipt_auto_print: data.receipt_auto_print ?? true,
      receipt_copies: data.receipt_copies ?? 1,
      print_kitchen_receipt: data.print_kitchen_receipt ?? false,
      trading_name: config.trading_name ?? data.name ?? '',
      franchise_name: config.franchise_name ?? '',
      branch_name: config.branch_name ?? '',
      address: config.address ?? data.address ?? '',
      phone: config.phone ?? data.phone ?? '',
      footer_message: config.footer_message ?? '',
      qr_data: config.qr_data ?? '',
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put('/v1/business/settings', {
        vat_registered: form.vat_registered,
        vat_number: form.vat_number.trim() || null,
        vat_rate_basis_points: Math.round(parseFloat(form.vat_rate_percent || '0') * 100),
        vat_inclusive_pricing: form.vat_inclusive_pricing,
        receipt_paper_width_mm: form.receipt_paper_width_mm,
        receipt_auto_print: form.receipt_auto_print,
        receipt_copies: form.receipt_copies,
        print_kitchen_receipt: form.print_kitchen_receipt,
        receipt_config_json: {
          trading_name: form.trading_name.trim(),
          franchise_name: form.franchise_name.trim() || null,
          branch_name: form.branch_name.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          footer_message: form.footer_message.trim() || null,
          qr_data: form.qr_data.trim() || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast({ title: 'Receipt settings saved' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  const columns = form.receipt_paper_width_mm === 58 ? 32 : 48;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receipts</h1>
        <p className="text-sm text-muted-foreground">
          What prints on the till slip, and how.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> What appears on the slip
          </CardTitle>
          <CardDescription>
            The slip is generated fresh for every sale, so totals and VAT are always live.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="trading">Trading name</Label>
            <Input id="trading" value={form.trading_name}
              onChange={(e) => setForm({ ...form, trading_name: e.target.value })}
              placeholder="Ciao Pizza" />
          </div>
          <div>
            <Label htmlFor="franchise">Franchise name (optional)</Label>
            <Input id="franchise" value={form.franchise_name}
              onChange={(e) => setForm({ ...form, franchise_name: e.target.value })}
              placeholder="Leave blank if the same as trading name" />
          </div>
          <div>
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" value={form.branch_name}
              onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
              placeholder="Lifestyle Centre" />
          </div>
          <div>
            <Label htmlFor="phone">Telephone</Label>
            <Input id="phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="footer">Footer message</Label>
            <Input id="footer" value={form.footer_message}
              onChange={(e) => setForm({ ...form, footer_message: e.target.value })}
              placeholder="Thank you! Grazie!" />
          </div>
          <div>
            <Label htmlFor="qr">QR code content (optional)</Label>
            <Input id="qr" value={form.qr_data}
              onChange={(e) => setForm({ ...form, qr_data: e.target.value })}
              placeholder="https://…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VAT</CardTitle>
          <CardDescription>
            A VAT-registered business must show its VAT number and a tax breakdown for the
            slip to be a valid tax invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.vat_registered}
              onChange={(e) => setForm({ ...form, vat_registered: e.target.checked })}
              className="h-4 w-4" />
            <span className="text-sm font-medium">This business is VAT registered</span>
          </label>

          {form.vat_registered && (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="vatno">VAT number</Label>
                <Input id="vatno" value={form.vat_number}
                  onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                  placeholder="4123456789" />
              </div>
              <div>
                <Label htmlFor="vatrate">VAT rate (%)</Label>
                <Input id="vatrate" value={form.vat_rate_percent}
                  onChange={(e) => setForm({ ...form, vat_rate_percent: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="vatmode">Menu prices</Label>
                <select id="vatmode"
                  value={form.vat_inclusive_pricing ? 'incl' : 'excl'}
                  onChange={(e) =>
                    setForm({ ...form, vat_inclusive_pricing: e.target.value === 'incl' })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="incl">Already include VAT</option>
                  <option value="excl">Exclude VAT (added at the till)</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground md:col-span-3">
                {form.vat_inclusive_pricing
                  ? 'Prices stay exactly as they are on the menu; VAT is shown as the portion inside the total. This is the normal South African setup.'
                  : 'VAT is ADDED on top, so customers pay more than the menu price. Only choose this if your menu prices genuinely exclude VAT.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Printing
          </CardTitle>
          <CardDescription>
            Automatic printing also needs Chrome started with --kiosk-printing on the till PC —
            see the install runbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="width">Paper width</Label>
              <select id="width" value={form.receipt_paper_width_mm}
                onChange={(e) =>
                  setForm({ ...form, receipt_paper_width_mm: parseInt(e.target.value, 10) })}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={80}>80 mm (48 characters)</option>
                <option value={58}>58 mm (32 characters)</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Currently {columns} characters per line.
              </p>
            </div>
            <div>
              <Label htmlFor="copies">Copies</Label>
              <Input id="copies" type="number" min={1} max={5} value={form.receipt_copies}
                onChange={(e) =>
                  setForm({ ...form, receipt_copies: parseInt(e.target.value || '1', 10) })} />
            </div>
          </div>

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.receipt_auto_print}
              onChange={(e) => setForm({ ...form, receipt_auto_print: e.target.checked })}
              className="h-4 w-4" />
            <span className="text-sm font-medium">Print the customer receipt automatically</span>
          </label>

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.print_kitchen_receipt}
              onChange={(e) => setForm({ ...form, print_kitchen_receipt: e.target.checked })}
              className="h-4 w-4" />
            <span className="text-sm font-medium">Also print a kitchen slip</span>
          </label>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save receipt settings
      </Button>
    </div>
  );
}

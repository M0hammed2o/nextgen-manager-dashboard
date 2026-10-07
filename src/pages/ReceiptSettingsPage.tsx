import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { FileImage, Loader2, Printer, Receipt, Upload, X } from 'lucide-react';
import { useRef, useState as useLocalState } from 'react';
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
  receipt_reference_asset_id?: string | null;
}

interface UploadUrlResponse {
  upload_url: string;
  public_url: string;
  asset_id: string;
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [referenceUrl, setReferenceUrl] = useLocalState<string | null>(null);
  const [referenceIsPdf, setReferenceIsPdf] = useLocalState(false);
  const [uploading, setUploading] = useLocalState(false);

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

  /**
   * Upload the restaurant's EXISTING till slip as a design reference.
   *
   * This file is never printed. A thermal head is 1-bit and 384/576 dots
   * wide, a photo cannot reflow for a variable number of line items, and
   * totals and VAT have to be live values rather than pixels. We keep it so
   * the manager can sit their old slip next to the preview and match the
   * layout field by field.
   */
  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast({
        title: 'Unsupported file',
        description: 'Upload a photo (PNG or JPEG) or a PDF of your current slip.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please keep it under 5MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { upload_url, public_url, asset_id } = await apiClient.post<UploadUrlResponse>(
        '/v1/business/assets/upload-url',
        { kind: 'RECEIPT_REFERENCE', content_type: file.type, original_filename: file.name }
      );
      await apiClient.uploadFile(upload_url, file);
      await apiClient.put('/v1/business/settings', { receipt_reference_asset_id: asset_id });
      setReferenceUrl(public_url);
      setReferenceIsPdf(file.type === 'application/pdf');
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast({
        title: 'Reference saved',
        description: 'Use it to match your settings below. It is never printed.',
      });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // A VAT-registered business must have a rate above 0% — 0%/empty would
  // save (and print) a "TAX INVOICE" that charges no VAT at all.
  const vatRateInvalid =
    form.vat_registered && !(parseFloat(form.vat_rate_percent || '0') > 0);

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
              onChange={(e) => {
                const registered = e.target.checked;
                // Turning VAT registration ON with the rate still at 0/empty
                // would otherwise silently save (and print) a "TAX INVOICE"
                // with 0% VAT charged on every sale — default to the
                // standard South African rate instead of leaving that trap.
                const currentRate = parseFloat(form.vat_rate_percent || '0');
                const needsDefault = registered && (!Number.isFinite(currentRate) || currentRate <= 0);
                setForm({
                  ...form,
                  vat_registered: registered,
                  vat_rate_percent: needsDefault ? '15' : form.vat_rate_percent,
                });
              }}
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
                  aria-invalid={vatRateInvalid}
                  onChange={(e) => setForm({ ...form, vat_rate_percent: e.target.value })} />
                {vatRateInvalid && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    Enter a VAT rate above 0% — a VAT-registered business can't print a Tax
                    Invoice showing 0% VAT.
                  </p>
                )}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" /> Your current till slip
            </CardTitle>
            <CardDescription>
              Upload a photo or PDF of the slip you print today, then match the settings
              above to it. This file is a reference only — it is never printed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={uploadReference}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {referenceUrl ? 'Replace reference' : 'Upload your slip'}
            </Button>

            {referenceUrl && (
              <div className="rounded-lg border p-2">
                {referenceIsPdf ? (
                  <a href={referenceUrl} target="_blank" rel="noreferrer"
                     className="flex items-center gap-2 p-3 text-sm text-primary underline">
                    <FileImage className="h-4 w-4" /> Open the PDF you uploaded
                  </a>
                ) : (
                  <img src={referenceUrl} alt="Your current till slip"
                       className="max-h-96 w-full object-contain" />
                )}
              </div>
            )}
            {!referenceUrl && (
              <p className="text-sm text-muted-foreground">
                Nothing uploaded yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              How your slip will print at {form.receipt_paper_width_mm}&nbsp;mm, using example
              sale figures.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="mx-auto overflow-hidden rounded border bg-white p-3 font-mono text-[11px] leading-tight text-black"
              style={{ width: form.receipt_paper_width_mm === 58 ? '58mm' : '80mm' }}
            >
              <div className="text-center">
                {form.franchise_name &&
                  form.franchise_name.trim().toLowerCase() !== form.trading_name.trim().toLowerCase() && (
                    <div className="font-bold">{form.franchise_name}</div>
                  )}
                <div className="font-bold">{form.trading_name || 'Your Restaurant'}</div>
                {form.branch_name && <div>{form.branch_name}</div>}
                {form.address && <div>{form.address}</div>}
                {form.phone && <div>Tel: {form.phone}</div>}
                {form.vat_registered && form.vat_number && <div>VAT No: {form.vat_number}</div>}
                {form.vat_registered && <div className="mt-1 font-bold">TAX INVOICE</div>}
              </div>

              <div className="my-1 border-t border-dashed border-black" />
              <div className="text-center font-bold">Order A-0042</div>
              <div className="text-center">{new Date().toLocaleString()}</div>
              <div className="my-1 border-t border-dashed border-black" />

              <div className="flex justify-between"><span>2 x Large Margherita</span><span>R298.00</span></div>
              <div className="pl-2 text-[10px]">Large</div>
              <div className="flex justify-between"><span>1 x Coca-Cola 330ml</span><span>R22.00</span></div>

              <div className="my-1 border-t border-dashed border-black" />
              <div className="flex justify-between"><span>Subtotal</span><span>R320.00</span></div>
              {form.vat_registered && (
                <div className="flex justify-between">
                  <span>
                    VAT @ {Number(form.vat_rate_percent || 0).toFixed(2)}%
                    {form.vat_inclusive_pricing ? ' (incl)' : ''}
                  </span>
                  <span>
                    R{(form.vat_inclusive_pricing
                        ? (320 * Number(form.vat_rate_percent || 0)) / (100 + Number(form.vat_rate_percent || 0))
                        : (320 * Number(form.vat_rate_percent || 0)) / 100
                      ).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="my-1 border-t border-black" />
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>
                  R{(form.vat_inclusive_pricing
                      ? 320
                      : 320 * (1 + Number(form.vat_rate_percent || 0) / 100)
                    ).toFixed(2)}
                </span>
              </div>
              <div className="my-1 border-t border-dashed border-black" />
              <div className="flex justify-between"><span>Paid by</span><span>CASH</span></div>
              <div className="flex justify-between"><span>Cash</span><span>R350.00</span></div>
              <div className="flex justify-between"><span>Change</span><span>R30.00</span></div>

              {form.footer_message && (
                <div className="mt-2 text-center">{form.footer_message}</div>
              )}
              {form.qr_data && (
                <div className="mt-2 text-center text-[10px] text-muted-foreground">[ QR code ]</div>
              )}
            </div>

            {!form.vat_inclusive_pricing && form.vat_registered && (
              <p className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                Heads up: with VAT excluded, a R320 menu total charges the customer more than
                R320. South African menu prices normally already include VAT.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || vatRateInvalid}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save receipt settings
        </Button>
        {vatRateInvalid && (
          <p className="mt-2 text-xs font-medium text-destructive">
            Fix the VAT rate above before saving.
          </p>
        )}
      </div>
    </div>
  );
}

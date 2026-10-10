/**
 * Settings -> Restaurant Identity (UI V2, Phase E9).
 *
 * Where a restaurant actually configures the branding everything else in the
 * programme consumes. Without this page the whole personalisation layer is
 * unreachable by a customer.
 *
 * DESIGN RULE: ask for ONE colour, not fifteen.
 * The restaurant supplies a logo, a trading name and a primary colour (plus an
 * optional accent). Every other value -- hover, active, soft tint, border
 * tint, the text colour that sits on the brand, chart series -- is DERIVED by
 * `lib/brand.ts`. Asking an owner to pick a "hover colour" is asking them to
 * do the design system's job, and is how a product ends up looking broken in
 * the hands of someone who is not a designer.
 *
 * The preview uses the SAME `deriveBrand()` the live app uses, so what is
 * shown here cannot drift from what the till and dashboard actually render.
 * A preview computed by its own private logic would be a second source of
 * truth, and would eventually lie.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, RotateCcw, Upload } from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { PageHeader, PageSkeleton, ErrorState } from '@/components/shared/PageComponents';
import type { BusinessSettings, UploadUrlResponse } from '@/types/api';
import {
  AA_LARGE,
  NEXTGEN_DEFAULT_BRAND,
  NON_TEXT_MIN,
  contrastHsl,
  deriveBrand,
  hexToHsl,
  isSafeForSmallText,
} from '@/lib/brand';

const LOGO_MAX_MB = 2;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * UI V2.1 (A7): swatch-first colour picking — a curated starting set an
 * owner can tap instead of typing or hunting in the native picker. Purely a
 * convenience shortcut: clicking one just sets the same hex string typing it
 * would, so it goes through the exact same state, validation (`HEX_RE`),
 * `deriveBrand()` and save payload as any other value. Not a second colour
 * engine — there is still only one way a colour reaches the backend.
 */
const PRESET_SWATCHES = [
  '#C62828', '#E65100', '#F9A825', '#2E7D32',
  '#00838F', '#1565C0', '#5E35B1', '#AD1457',
] as const;

interface Draft {
  brand_display_name: string;
  brand_primary_colour: string;
  brand_accent_colour: string;
  logo_asset_id: string | null;
  logo_url: string | null;
  brand_icon_asset_id: string | null;
  brand_icon_url: string | null;
}

/** `hsl(H S% L%)` for inline preview styles. */
const hsl = (v: string) => `hsl(${v})`;

export default function BrandingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logoInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'logo' | 'icon' | null>(null);

  const { data: settings, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<BusinessSettings>('/v1/business/settings'),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (!settings || draft) return;
    setDraft({
      brand_display_name: settings.brand_display_name ?? '',
      brand_primary_colour: settings.brand_primary_colour ?? '',
      brand_accent_colour: settings.brand_accent_colour ?? '',
      logo_asset_id: settings.logo_asset_id,
      logo_url: settings.logo_url,
      brand_icon_asset_id: settings.brand_icon_asset_id,
      brand_icon_url: settings.brand_icon_url,
    });
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.put('/v1/business/settings', body),
    onSuccess: () => {
      // Invalidating ['settings'] also refreshes BrandSync, so the whole
      // dashboard re-themes the moment this saves -- no reload needed.
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Branding saved', description: 'Your restaurant identity is live.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save branding', description: err.message, variant: 'destructive' }),
  });

  async function upload(file: File, which: 'logo' | 'icon') {
    if (file.size > LOGO_MAX_MB * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: `Please choose an image under ${LOGO_MAX_MB}MB.`,
        variant: 'destructive',
      });
      return;
    }
    setUploading(which);
    try {
      const res = await apiClient.post<UploadUrlResponse>('/v1/business/assets/upload-url', {
        kind: 'BUSINESS_LOGO',
        content_type: file.type,
      });
      await apiClient.uploadFile(res.upload_url, file);
      setDraft((d) =>
        d
          ? which === 'logo'
            ? { ...d, logo_asset_id: res.asset_id, logo_url: res.public_url }
            : { ...d, brand_icon_asset_id: res.asset_id, brand_icon_url: res.public_url }
          : d
      );
      toast({ title: 'Image uploaded', description: 'Save below to apply it.' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  }

  const primary = draft?.brand_primary_colour?.trim() ?? '';
  const primaryValid = primary === '' || HEX_RE.test(primary);
  const accent = draft?.brand_accent_colour?.trim() ?? '';
  const accentValid = accent === '' || HEX_RE.test(accent);

  // The same derivation the live app performs.
  const derived = useMemo(
    () => deriveBrand({ primary: primaryValid ? primary : null, accent: accentValid ? accent : null }),
    [primary, accent, primaryValid, accentValid]
  );

  /** Honest, specific feedback -- not a generic "this might be hard to read". */
  const contrastNotes = useMemo(() => {
    if (!primary || !primaryValid) return [];
    const notes: { tone: 'info' | 'warn'; text: string }[] = [];
    const supplied = hexToHsl(primary);
    if (supplied) {
      const visibility = contrastHsl(supplied, { h: 0, s: 0, l: 100 });
      if (visibility < NON_TEXT_MIN) {
        notes.push({
          tone: 'warn',
          text:
            `This colour is too light to be seen as a button on a white card ` +
            `(${visibility.toFixed(1)}:1 against white, ${NON_TEXT_MIN}:1 needed). ` +
            `NextGen will darken it slightly where it has to stay visible. Your exact ` +
            `colour is still used for large areas.`,
        });
      }
    }
    notes.push({
      tone: 'info',
      text:
        `Buttons will use ${derived.tokens['--brand-on-primary'].startsWith('0 0% 100%') ? 'white' : 'charcoal'} ` +
        `text on your colour (${derived.contrast.toFixed(1)}:1 contrast, ${AA_LARGE}:1 needed).`,
    });
    if (!isSafeForSmallText(primary)) {
      notes.push({
        tone: 'info',
        text: 'Small text is never placed directly on your colour, so it stays readable everywhere.',
      });
    }
    return notes;
  }, [primary, primaryValid, derived]);

  if (isLoading || !draft) return <PageSkeleton />;
  if (isError) return <ErrorState message="Could not load your settings." onRetry={() => refetch()} />;

  const previewStyle = {
    // Scope the derived tokens to the preview only, so editing here never
    // re-themes the dashboard around it before the owner has saved.
    ['--p' as string]: derived.tokens['--brand-primary'],
    ['--pf' as string]: derived.tokens['--brand-on-primary'],
    ['--ps' as string]: derived.tokens['--brand-primary-soft'],
    ['--pb' as string]: derived.tokens['--brand-primary-border'],
  } as React.CSSProperties;

  const dirty =
    draft.brand_display_name !== (settings?.brand_display_name ?? '') ||
    draft.brand_primary_colour !== (settings?.brand_primary_colour ?? '') ||
    draft.brand_accent_colour !== (settings?.brand_accent_colour ?? '') ||
    draft.logo_asset_id !== settings?.logo_asset_id ||
    draft.brand_icon_asset_id !== settings?.brand_icon_asset_id;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Restaurant Identity" description="Your logo, name and colour — used across your till, dashboard and customer receipts." />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft({
                brand_display_name: '',
                brand_primary_colour: '',
                brand_accent_colour: '',
                logo_asset_id: null,
                logo_url: null,
                brand_icon_asset_id: null,
                brand_icon_url: null,
              });
              toast({ title: 'Reset to NextGen default', description: 'Save below to apply it.' });
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to default
          </Button>
          <Button
            disabled={!dirty || !primaryValid || !accentValid || save.isPending}
            onClick={() =>
              save.mutate({
                brand_display_name: draft.brand_display_name.trim() || null,
                brand_primary_colour: primary || null,
                brand_accent_colour: accent || null,
                logo_asset_id: draft.logo_asset_id,
                brand_icon_asset_id: draft.brand_icon_asset_id,
              })
            }
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save branding
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Configuration ────────────────────────────────────────────── */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold text-foreground">Name</h3>
            <div className="space-y-1.5">
              <label htmlFor="brand-name" className="text-sm font-medium text-foreground">
                Trading name
              </label>
              <input
                id="brand-name"
                value={draft.brand_display_name}
                onChange={(e) => setDraft({ ...draft, brand_display_name: e.target.value })}
                placeholder={settings?.name ?? 'Your restaurant'}
                maxLength={255}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Shown on the till and dashboard. Your registered name{' '}
                <span className="font-medium text-foreground">{settings?.name}</span> stays on invoices.
              </p>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold text-foreground">Logo</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['logo', 'Logo', draft.logo_url, 'Wide or square. Shown beside your name.'],
                ['icon', 'Square icon', draft.brand_icon_url, 'Optional. Used where a square is needed.'],
              ] as const).map(([which, label, url, hint]) => (
                <div key={which} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-2">
                    {url ? (
                      // object-contain: a wordmark cropped to fill would
                      // misrepresent the restaurant's own identity.
                      <img src={url} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No {label.toLowerCase()} yet</span>
                    )}
                  </div>
                  <input
                    ref={which === 'logo' ? logoInput : iconInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, which);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={uploading !== null}
                    onClick={() => (which === 'logo' ? logoInput : iconInput).current?.click()}
                  >
                    {uploading === which ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Upload
                  </Button>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold text-foreground">Colour</h3>
            {([
              ['brand_primary_colour', 'Primary colour', primaryValid, 'Used for buttons, active navigation and highlights.'],
              ['brand_accent_colour', 'Accent (optional)', accentValid, 'Used for a second chart series. Derived from your primary when empty.'],
            ] as const).map(([field, label, valid, hint]) => {
              const current = draft[field].trim().toUpperCase();
              return (
                <div key={field} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{label}</p>

                  {/* Swatch-first: tap a swatch, or the large preview, to pick
                      a colour visually. Typing a hex stays available but is
                      now the secondary path below. */}
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label={`${label} picker`}
                      value={HEX_RE.test(draft[field]) ? draft[field] : NEXTGEN_DEFAULT_BRAND}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value.toUpperCase() })}
                      className="h-14 w-14 shrink-0 cursor-pointer rounded-xl border border-input bg-background p-1 shadow-sm"
                    />
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      {PRESET_SWATCHES.map((hex) => {
                        const selected = current === hex;
                        return (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Use ${hex} for ${label.toLowerCase()}`}
                            aria-pressed={selected}
                            onClick={() => setDraft({ ...draft, [field]: hex })}
                            className={
                              'grid h-8 w-8 place-items-center rounded-full border-2 transition-transform ' +
                              (selected ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105')
                            }
                            style={{ background: hex }}
                          >
                            {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-0.5">
                    <label htmlFor={field} className="text-xs text-muted-foreground">
                      or enter a hex code
                    </label>
                    <input
                      id={field}
                      value={draft[field]}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                      placeholder="#000000"
                      className="h-8 w-28 rounded-md border border-input bg-background px-2 font-mono text-xs uppercase text-foreground"
                    />
                  </div>

                  {!valid && <p className="text-xs text-destructive">Use a 6-digit hex colour, like #C62828.</p>}
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
              );
            })}

            {contrastNotes.map((n, i) => (
              <p
                key={i}
                className={
                  n.tone === 'warn'
                    ? 'rounded-md bg-warning/10 px-3 py-2 text-xs text-warning'
                    : 'text-xs text-muted-foreground'
                }
              >
                {n.text}
              </p>
            ))}
          </section>
        </div>

        {/* ── Live preview ─────────────────────────────────────────────── */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-6" style={previewStyle}>
          <div>
            <h3 className="font-semibold text-foreground">Preview</h3>
            <p className="text-xs text-muted-foreground">
              Rendered with the same engine the live apps use.
            </p>
          </div>

          <div className="space-y-5">
            <Preview title="Navigation">
              <div className="flex gap-1 rounded-lg bg-muted/40 p-1.5">
                <span className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ background: hsl('var(--ps)'), color: hsl('var(--p)') }}>
                  Dashboard
                </span>
                <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Orders</span>
                <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Stock</span>
              </div>
            </Preview>

            <Preview title="Primary button">
              <button
                type="button"
                className="h-11 w-full rounded-lg text-sm font-semibold"
                style={{ background: hsl('var(--p)'), color: hsl('var(--pf)') }}
              >
                Checkout · R 213.50
              </button>
            </Preview>

            <Preview title="POS category">
              <div className="flex gap-2">
                <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: hsl('var(--p)'), color: hsl('var(--pf)') }}>
                  All
                </span>
                <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">Drinks</span>
                <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">Food</span>
              </div>
            </Preview>

            <Preview title="Login / PIN screen">
              <div className="rounded-lg border border-border bg-background p-4 text-center">
                <div
                  className="mx-auto grid h-12 w-12 place-items-center rounded-xl text-sm font-semibold"
                  style={{ background: hsl('var(--p)'), color: hsl('var(--pf)') }}
                >
                  {monogram(draft.brand_display_name || settings?.name)}
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {draft.brand_display_name || settings?.name}
                </p>
                <p className="text-xs text-muted-foreground">Enter your 4-digit PIN</p>
              </div>
            </Preview>

            <Preview title="Customer receipt">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  {draft.logo_url ? (
                    <img src={draft.logo_url} alt="" className="h-8 w-8 object-contain" />
                  ) : (
                    <div
                      className="grid h-8 w-8 place-items-center rounded text-[10px] font-semibold"
                      style={{ background: hsl('var(--p)'), color: hsl('var(--pf)') }}
                    >
                      {monogram(draft.brand_display_name || settings?.name)}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    {draft.brand_display_name || settings?.name}
                  </span>
                </div>
                <div className="space-y-1 py-2 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>1 x Americano</span><span className="tabular-nums">R 29.00</span></div>
                  <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span className="tabular-nums">R 29.00</span></div>
                </div>
                <p className="border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
                  Powered by NextGen
                </p>
              </div>
            </Preview>
          </div>
        </section>
      </div>
    </div>
  );
}

function Preview({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function monogram(name?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'NG';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

import { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "12.5%"; null (no basis to compute a share) is shown as an em dash, never 0%. */
export function formatPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

const ORDINALS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };
export function ordinal(rank: number): string {
  return ORDINALS[rank] ?? `${rank}th`;
}

/** Product photo with a neutral placeholder for no image or an image that fails to load. */
export function ProductImage({ url, name, className }: { url: string | null; name: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <div
        data-testid="product-image-placeholder"
        className={cn('flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', className)}
        aria-hidden="true"
      >
        <Package className="h-1/2 w-1/2" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={cn('shrink-0 rounded-md object-cover', className)}
    />
  );
}

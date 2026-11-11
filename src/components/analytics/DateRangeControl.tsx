import { useState } from 'react';
import type { SalesWalletRange } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Shared by every analytics section that reports on the backend's
// range=today|yesterday|7d|month|custom contract (Sales Wallets, Best sellers).

export const RANGES: { value: SalesWalletRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

/** Builds the range query string (custom adds start/end). */
export function buildQuery(
  range: SalesWalletRange, start: string, end: string, extra: Record<string, string | number> = {},
): string {
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('start', start);
    params.set('end', end);
  }
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

export function useDateRange(initial: SalesWalletRange = 'today') {
  const [range, setRange] = useState<SalesWalletRange>(initial);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const customReady = range !== 'custom' || (start !== '' && end !== '' && start <= end);
  const customOrderInvalid = range === 'custom' && start !== '' && end !== '' && start > end;
  return { range, setRange, start, setStart, end, setEnd, customReady, customOrderInvalid };
}

export type DateRangeState = ReturnType<typeof useDateRange>;

/** Range buttons plus, for Custom, the start/end date inputs. `idPrefix` keeps input ids unique per section. */
export function DateRangeControl({ state, idPrefix }: { state: DateRangeState; idPrefix: string }) {
  const { range, setRange, start, setStart, end, setEnd } = state;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {RANGES.map((r) => (
        <Button key={r.value} variant={range === r.value ? 'default' : 'outline'} size="sm" onClick={() => setRange(r.value)}>
          {r.label}
        </Button>
      ))}
      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-start`} className="text-xs">Start date</Label>
            <Input id={`${idPrefix}-start`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-end`} className="text-xs">End date</Label>
            <Input id={`${idPrefix}-end`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { CheckCircle2, Circle, AlertCircle, ArrowRight, Upload } from 'lucide-react';

interface SetupStep {
  key: string;
  label: string;
  description: string;
  status: 'done' | 'partial' | 'todo';
  detail: string;
  count: number;
  total: number;
  required_to_trade: boolean;
  href: string | null;
}

interface SetupProgress {
  business_name: string;
  inventory_enabled: boolean;
  ready_to_trade: boolean;
  percent_complete: number;
  steps: SetupStep[];
}

/**
 * Setup — what still needs configuring before this restaurant can trade.
 *
 * Exists so an owner never has to ask NextGen "am I ready?". Every status
 * here is computed from records that actually exist, not a checklist someone
 * ticks off, so it cannot say "done" for something that was never set up.
 */
export default function SetupPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['setup-progress'],
    queryFn: () => apiClient.get<SetupProgress>('/v1/business/setup/progress'),
  });

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return <p className="text-sm text-destructive">Could not load setup: {(error as Error).message}</p>;
  }
  if (!data) return null;

  const icon = (status: string) =>
    status === 'done' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      : status === 'partial' ? <AlertCircle className="h-5 w-5 text-amber-500" />
        : <Circle className="h-5 w-5 text-muted-foreground" />;

  const outstanding = data.steps.filter((s) => s.status !== 'done' && s.required_to_trade);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Set up {data.business_name}</h1>
        <p className="text-sm text-muted-foreground">
          Everything you need to configure yourself, in one place.
        </p>
      </div>

      <Card>
        <CardContent className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Setup progress</p>
              <p className="text-3xl font-bold tabular-nums">{data.percent_complete}%</p>
            </div>
            <div className="text-right">
              {data.ready_to_trade ? (
                <p className="flex items-center gap-2 font-medium text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> Ready to trade
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {outstanding.length} thing{outstanding.length === 1 ? '' : 's'} still to do
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${data.percent_complete}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Have a spreadsheet?
          </CardTitle>
          <CardDescription>
            Upload your menu, ingredient list or recipe sheet instead of typing it in.
            You will see a preview before anything changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/import">Import from a spreadsheet <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.steps.map((step) => (
          <Card key={step.key} className={step.status === 'done' ? 'opacity-75' : undefined}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex-none">{icon(step.status)}</div>
                <div className="min-w-0">
                  <p className="font-medium">
                    {step.label}
                    {!step.required_to_trade && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        recommended
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  <p className="mt-1 text-sm">
                    <span className={
                      step.status === 'done' ? 'text-emerald-600'
                        : step.status === 'partial' ? 'text-amber-600'
                          : 'text-muted-foreground'
                    }>
                      {step.detail}
                    </span>
                  </p>
                  {step.total > 0 && step.status !== 'done' && (
                    <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.round((step.count / step.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {step.href && (
                <Button variant={step.status === 'done' ? 'outline' : 'default'} asChild>
                  <Link to={step.href}>
                    {step.status === 'done' ? 'Review' : 'Set up'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!data.inventory_enabled && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Stock tracking is not switched on for this restaurant. Ask NextGen to enable it
              if you want recipes, stocktakes and variance reporting.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

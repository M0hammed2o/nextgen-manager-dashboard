import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { formatDateTime } from '@/lib/mappers';
import { launchEmbeddedSignup } from '@/lib/whatsapp-embedded-signup';
import type {
  WhatsAppConnectConfig, WhatsAppConnection,
  WhatsAppHealthCheckResponse, WhatsAppTestMessageResponse, WhatsAppStatus,
} from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import {
  MessageCircle, CheckCircle2, AlertTriangle, XCircle, Loader2,
  PauseCircle, PlayCircle, ChevronDown, Send, Unplug, Activity,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUS_BADGE_VARIANT: Record<WhatsAppConnection['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  NOT_CONNECTED: 'outline',
  PENDING: 'secondary',
  CONNECTED: 'default',
  NEEDS_ATTENTION: 'destructive',
  DISCONNECTED: 'destructive',
};

const STATUS_LABEL: Record<WhatsAppConnection['status'], string> = {
  NOT_CONNECTED: 'Not connected',
  PENDING: 'Connecting…',
  CONNECTED: 'Connected',
  NEEDS_ATTENTION: 'Needs attention',
  DISCONNECTED: 'Disconnected',
};

function TechnicalDetails({ details }: { details: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-0 text-muted-foreground hover:text-foreground">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          View technical details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {JSON.stringify(details, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Bot pause/resume — reads and writes the exact same business fields
 * (`whatsapp_paused`/`whatsapp_paused_at`) as the persistent
 * `WhatsAppPauseBanner` (see components/layout/WhatsAppPauseBanner.tsx) via
 * the same three REST endpoints. This is deliberately NOT a second
 * implementation of the pause concept — pausing here is immediately
 * reflected in the banner (and vice versa) because both read/write the same
 * backend state; only the banner also subscribes to SSE for live updates
 * without a page visit.
 */
function BotPauseCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => apiClient.get<WhatsAppStatus>('/v1/business/whatsapp/status'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiClient.post<WhatsAppStatus>('/v1/business/whatsapp/pause'),
    onSuccess: (res) => {
      queryClient.setQueryData(['whatsapp-status'], res);
      toast({ title: 'WhatsApp ordering paused' });
    },
    onError: (err: Error) => toast({ title: 'Could not pause', description: err.message, variant: 'destructive' }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiClient.post<WhatsAppStatus>('/v1/business/whatsapp/resume'),
    onSuccess: (res) => {
      queryClient.setQueryData(['whatsapp-status'], res);
      toast({ title: 'WhatsApp ordering resumed' });
    },
    onError: (err: Error) => toast({ title: 'Could not resume', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;

  const isPaused = status?.paused ?? false;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <div>
        <Label>{isPaused ? 'Bot paused' : 'Bot running'}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isPaused
            ? `Customers are seeing your busy message${status?.paused_by_name ? ` (paused by ${status.paused_by_name})` : ''}.`
            : 'Customers can place WhatsApp orders normally.'}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => (isPaused ? resumeMutation.mutate() : pauseMutation.mutate())}
        disabled={pauseMutation.isPending || resumeMutation.isPending}
      >
        {pauseMutation.isPending || resumeMutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isPaused ? (
          <PlayCircle className="w-3.5 h-3.5" />
        ) : (
          <PauseCircle className="w-3.5 h-3.5" />
        )}
        {isPaused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  );
}

export default function WhatsAppConnectPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'OWNER';

  const { data: settings, isLoading: settingsLoading } = useBusinessSettings();
  // Only fires the connection queries once settings have actually loaded and
  // confirm the module is on — defaulting this to `true` while settings is
  // still `undefined` (as the render-time fallback below does) would fire
  // both requests before we know whether this tenant even has WhatsApp
  // enabled, wastefully hitting a route that then 409s.
  const whatsappEnabledConfirmed = settings?.is_whatsapp_enabled === true;
  const whatsappEnabled = settings?.is_whatsapp_enabled ?? true;

  const {
    data: config, isLoading: configLoading, isError: configError,
    refetch: refetchConfig, isFetching: configFetching,
  } = useQuery({
    queryKey: ['whatsapp-connect-config'],
    queryFn: () => apiClient.get<WhatsAppConnectConfig>('/v1/business/whatsapp/connection/config'),
    enabled: whatsappEnabledConfirmed,
  });

  const {
    data: connection, isLoading: connectionLoading, isError: connectionError,
    refetch: refetchConnection, isFetching: connectionFetching,
  } = useQuery({
    queryKey: ['whatsapp-connection'],
    queryFn: () => apiClient.get<WhatsAppConnection>('/v1/business/whatsapp/connection'),
    enabled: whatsappEnabledConfirmed,
  });

  const [testTo, setTestTo] = useState('');
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<WhatsAppHealthCheckResponse | null>(null);
  const [connecting, setConnecting] = useState(false);

  const healthCheckMutation = useMutation({
    mutationFn: () => apiClient.post<WhatsAppHealthCheckResponse>('/v1/business/whatsapp/connection/health-check'),
    onSuccess: (res) => {
      setLastHealthCheck(res);
      queryClient.setQueryData(['whatsapp-connection'], res.connection);
      toast({
        title: res.ok ? 'Connection healthy' : 'Connection issue found',
        description: res.detail,
        variant: res.ok ? undefined : 'destructive',
      });
    },
    onError: (err: Error) => toast({ title: 'Health check failed', description: err.message, variant: 'destructive' }),
  });

  const testMessageMutation = useMutation({
    mutationFn: (to: string) =>
      apiClient.post<WhatsAppTestMessageResponse>('/v1/business/whatsapp/connection/test-message', { to }),
    onSuccess: (res) => {
      toast({
        title: res.success ? 'Test message sent' : 'Test message failed',
        description: res.detail,
        variant: res.success ? undefined : 'destructive',
      });
    },
    onError: (err: Error) => toast({ title: 'Could not send test message', description: err.message, variant: 'destructive' }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.delete<WhatsAppConnection>('/v1/business/whatsapp/connection'),
    onSuccess: (res) => {
      queryClient.setQueryData(['whatsapp-connection'], res);
      setDisconnectOpen(false);
      toast({ title: 'WhatsApp disconnected' });
    },
    onError: (err: Error) => {
      setDisconnectOpen(false);
      toast({ title: 'Could not disconnect', description: err.message, variant: 'destructive' });
    },
  });

  if (settingsLoading) return <PageSkeleton />;

  if (!whatsappEnabled) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Connect</h1>
          <p className="text-sm text-muted-foreground">Connect your own WhatsApp Business number</p>
        </div>
        <EmptyState
          icon={<MessageCircle className="w-10 h-10" />}
          title="WhatsApp ordering isn't enabled for this business"
          description="Contact NextGen support to switch on the WhatsApp ordering module before connecting a number."
        />
      </div>
    );
  }

  if (configLoading || connectionLoading) return <PageSkeleton />;

  if (configError || connectionError || !config || !connection) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Connect</h1>
        </div>
        <ErrorState
          message="Couldn't load your WhatsApp connection status."
          onRetry={() => { refetchConfig(); refetchConnection(); }}
          isRetrying={configFetching || connectionFetching}
        />
      </div>
    );
  }

  const handleConnectClick = async () => {
    if (connecting) return; // guard against a double-click opening two popups
    setConnecting(true);
    try {
      await launchEmbeddedSignup(config, {
        onCancelled: () => {
          // User closed the popup or hit Cancel — not an error, just reset.
        },
        onUnavailable: (message) => {
          toast({ title: 'Could not connect WhatsApp', description: message, variant: 'destructive' });
        },
        onExchangeResult: (result) => {
          queryClient.setQueryData(['whatsapp-connection'], result.connection);
          toast({
            title: result.success ? 'WhatsApp connected' : 'Connection not completed',
            description: result.message,
            variant: result.success ? undefined : 'destructive',
          });
        },
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Connect</h1>
          <p className="text-sm text-muted-foreground">Connect your own WhatsApp Business number for ordering</p>
        </div>
        <StatusBadge variant={STATUS_BADGE_VARIANT[connection.status]} label={STATUS_LABEL[connection.status]} />
      </div>

      {connection.on_legacy_platform_path && connection.status !== 'CONNECTED' && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Your WhatsApp ordering is currently running on NextGen's original shared setup. Connecting your own
          number here moves you to your own dedicated WhatsApp Business number — your existing ordering keeps
          working either way.
        </div>
      )}

      {/* Not available: Meta isn't configured platform-wide yet */}
      {!config.available && connection.status !== 'CONNECTED' && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<MessageCircle className="w-10 h-10" />}
              title="WhatsApp connection isn't set up on this platform yet"
              description={config.reason ?? 'Contact NextGen support to enable connecting your own WhatsApp Business number.'}
            />
          </CardContent>
        </Card>
      )}

      {/* Not connected / disconnected, and Meta IS configured — real Connect button */}
      {config.available && (connection.status === 'NOT_CONNECTED' || connection.status === 'DISCONNECTED') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect your WhatsApp Business number</CardTitle>
            <CardDescription>
              {connection.status === 'DISCONNECTED'
                ? `Disconnected ${formatDateTime(connection.disconnected_at)}. Reconnect to resume ordering on your own number.`
                : 'Link your own Meta WhatsApp Business Account so orders arrive on your number.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOwner ? (
              <Button onClick={handleConnectClick} disabled={connecting} className="gap-1.5">
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                {connecting ? 'Connecting…' : 'Connect WhatsApp'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Only the account owner can connect WhatsApp.</p>
            )}
          </CardContent>
        </Card>
      )}

      {connection.status === 'PENDING' && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Connecting your WhatsApp number… this can take a moment while we register it with Meta.
            </p>
          </CardContent>
        </Card>
      )}

      {connection.status === 'NEEDS_ATTENTION' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" /> Needs attention
            </CardTitle>
            <CardDescription>
              {connection.status_reason ?? 'Your WhatsApp connection has a problem that needs fixing.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => healthCheckMutation.mutate()}
              disabled={healthCheckMutation.isPending}
            >
              {healthCheckMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              Re-check connection
            </Button>
            {lastHealthCheck && <TechnicalDetails details={lastHealthCheck.technical_details} />}
          </CardContent>
        </Card>
      )}

      {connection.status === 'CONNECTED' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" /> Connected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Verified name</p>
                  <p className="font-medium text-foreground">{connection.verified_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone number</p>
                  <p className="font-medium text-foreground">{connection.display_phone_number ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quality rating</p>
                  <p className="font-medium text-foreground">{connection.quality_rating ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Connected since</p>
                  <p className="font-medium text-foreground">{formatDateTime(connection.connected_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs">
                  {connection.webhook_subscribed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                  Webhook subscribed
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {connection.phone_registered ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                  Phone registered
                </div>
              </div>

              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                Last health check: {formatDateTime(connection.last_health_check_at)} · Last webhook received: {formatDateTime(connection.last_webhook_at)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bot status</CardTitle>
            </CardHeader>
            <CardContent>
              <BotPauseCard />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test &amp; maintain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Send a test message</Label>
                <div className="flex gap-2">
                  <Input
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="e.g. 27821234567"
                  />
                  <Button
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => testMessageMutation.mutate(testTo)}
                    disabled={!testTo || testMessageMutation.isPending}
                  >
                    {testMessageMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send test
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <Label>Connection health</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Re-verify Meta still reports this connection as healthy.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => healthCheckMutation.mutate()}
                  disabled={healthCheckMutation.isPending}
                >
                  {healthCheckMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                  Check now
                </Button>
              </div>

              {isOwner && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <Label>Disconnect</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Unlink this WhatsApp number from NextGen ordering.</p>
                  </div>
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDisconnectOpen(true)}>
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers will no longer be able to place WhatsApp orders on this number until you reconnect. This
              does not delete any past orders or customer data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

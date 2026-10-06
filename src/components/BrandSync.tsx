/**
 * BrandSync (manager) — keeps BrandProvider in step with the signed-in
 * restaurant.
 *
 * Reads the branding straight off `GET /v1/business/settings`, which the
 * dashboard already fetches through `use-business-settings` under the shared
 * `['settings']` query key. That means branding costs NO extra request: it
 * rides along with the settings read every gated page already performs.
 *
 * Deliberately a separate component from `lib/brand-provider.tsx`, which is
 * shared verbatim with the staff PWA and must not know about either app's
 * auth or data-fetching shape.
 */
import { useEffect } from 'react';

import { useBusinessSettings } from '@/hooks/use-business-settings';
import { useBrand } from '@/lib/brand-provider';

export function BrandSync() {
  const { data: settings } = useBusinessSettings();
  const brand = useBrand();

  useEffect(() => {
    if (!settings) return;
    brand.setBrand({
      businessId: settings.id,
      // Trading name for display; `name` stays the legal name on invoices.
      displayName: settings.brand_display_name || settings.name,
      branchName: null,
      logoUrl: settings.logo_url,
      iconUrl: settings.brand_icon_url,
      primaryColour: settings.brand_primary_colour,
      accentColour: settings.brand_accent_colour,
    });
    // Keyed on the branding fields themselves so an unchanged settings
    // refetch does not rewrite storage on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings?.id,
    settings?.brand_display_name,
    settings?.name,
    settings?.logo_url,
    settings?.brand_icon_url,
    settings?.brand_primary_colour,
    settings?.brand_accent_colour,
  ]);

  return null;
}

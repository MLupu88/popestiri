/**
 * Contract for a future approved TikTok/Facebook/public-index provider.
 * Implementations must declare coverage and provenance; this milestone does
 * not instantiate one or make paid provider calls.
 */
export type PlannedSocialPlatform = 'tiktok' | 'facebook';

export type SocialCoverage = {
  provider: string;
  platform: PlannedSocialPlatform;
  coverage: 'approved_api' | 'public_index' | 'partial' | 'unavailable';
  limitations: string[];
  termsUrl?: string;
  observedAt: string;
};

export type SocialReference = {
  platform: PlannedSocialPlatform;
  originalUrl: string;
  publisherName?: string;
  publisherId?: string;
  publishedAt?: string;
  observedAt: string;
  publicMetrics?: {viewCount?: string; commentCount?: string; shareCount?: string};
  provenance: {provider: string; query: string; coverage: SocialCoverage['coverage']; limitations: string[]};
};

export type SocialDiscoveryResult = {
  status: 'succeeded' | 'partial' | 'unavailable';
  references: SocialReference[];
  coverage: SocialCoverage;
  errorCode?: string;
};

export interface SocialDiscoveryAdapter {
  readonly platform: PlannedSocialPlatform;
  discover(query: string, options?: {signal?: AbortSignal; maxResults?: number}): Promise<SocialDiscoveryResult>;
}

export const plannedSocialAdapters: ReadonlyArray<{platform: PlannedSocialPlatform; status: 'contract_only'; manualFallback: string}> = [
  {platform:'tiktok',status:'contract_only',manualFallback:'Social Intake sau referințe indexate public, fără scraping restricționat.'},
  {platform:'facebook',status:'contract_only',manualFallback:'Social Intake sau provider/API aprobat, fără scraping de profiluri sau grupuri.'}
];

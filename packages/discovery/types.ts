export type DiscoverySourceKind = 'rss' | 'google_trends' | 'youtube_api' | 'social_intake';
export type DiscoveryStatus = 'new' | 'queued' | 'reviewing' | 'dismissed' | 'grouped';

export type DiscoverySource = {
  id: string;
  kind: DiscoverySourceKind;
  name: string;
  endpoint_url: string;
  verification_url: string;
  viewpoint: string;
  region: string;
  enabled: boolean;
  config: Record<string, unknown>;
  verified_at: string;
};

export type DiscoveryCandidateInput = {
  sourceId: string;
  sourceKind: Exclude<DiscoverySourceKind, 'social_intake'> | 'social_intake';
  sourceName: string;
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  summary?: string | null;
  observedAt: string;
  publishedAt?: string | null;
  provenance: Record<string, unknown>;
  popularitySignals?: Record<string, unknown>;
};

export type AdapterResult = {
  adapter: string;
  status: 'succeeded' | 'partial' | 'unavailable' | 'failed';
  candidates: DiscoveryCandidateInput[];
  seen: number;
  errorCode?: string;
  limitation?: string;
};

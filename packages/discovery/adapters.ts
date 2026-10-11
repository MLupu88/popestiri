import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import {downloadFeed, parseFeed, feedURL, type FeedItem} from '../connectors/rss.ts';
import type {DiscoveryCandidateInput, DiscoverySource, AdapterResult} from './types.ts';

type FeedDownloader = (url: string) => Promise<{xml: string; url: string}>;
type JsonFetcher = (url: string, init?: RequestInit) => Promise<Response>;

const asArray = (value: unknown): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const asText = (value: unknown): string => typeof value === 'string' ? value : typeof (value as any)?.['#text'] === 'string' ? (value as any)['#text'] : '';

function safeURL(value: string, host: string, path: string) {
  const parsed = new URL(value);
  if(parsed.protocol !== 'https:' || parsed.hostname !== host || parsed.pathname !== path || parsed.username || parsed.password || parsed.port) {
    throw new Error('Endpoint extern nevalidat pentru adaptor.');
  }
  return parsed;
}

export function googleTrendsURL(value: string) {
  const parsed = safeURL(value, 'trends.google.com', '/trending/rss');
  if(parsed.searchParams.get('geo') !== 'RO') throw new Error('Google Trends trebuie configurat pentru România.');
  return parsed;
}

export function youtubeAPIURL(value: string) {
  return safeURL(value, 'www.googleapis.com', '/youtube/v3/search');
}

function canonicalURL(value: string) {
  const parsed = new URL(value);
  if(!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('URL de candidat nevalid.');
  parsed.hash = '';
  const kept = new URLSearchParams();
  for(const [key,val] of parsed.searchParams) if(!key.toLowerCase().startsWith('utm_') && !['fbclid','gclid','si','feature'].includes(key.toLowerCase())) kept.append(key,val);
  kept.sort(); parsed.search = kept.toString();
  return parsed.href;
}

function provenance(source: DiscoverySource, adapter: string, limitation: string) {
  return {
    adapter,
    registryId: source.id,
    sourceName: source.name,
    verificationUrl: source.verification_url,
    viewpoint: source.viewpoint,
    limitation
  };
}

function rssCandidate(source: DiscoverySource, item: FeedItem, observedAt: string, signals: Record<string, unknown> = {}): DiscoveryCandidateInput {
  return {
    sourceId: source.id,
    sourceKind: source.kind,
    sourceName: source.name,
    originalUrl: item.url,
    canonicalUrl: canonicalURL(item.url),
    title: item.title,
    summary: item.excerpt || null,
    observedAt,
    publishedAt: item.publishedAt,
    provenance: provenance(source, source.kind === 'rss' ? 'rss_registry' : source.kind, 'RSS metadata is a lead, not verification.'),
    popularitySignals: signals
  };
}

export async function discoverRSS(source: DiscoverySource, options: {download?: FeedDownloader; now?: Date} = {}): Promise<AdapterResult> {
  const download = options.download ?? downloadFeed;
  const now = (options.now ?? new Date()).toISOString();
  try {
    if(source.config.registry !== 'built_in_verified') throw new Error('Fluxul RSS nu este marcat ca verificat în registru.');
    const endpoint = feedURL(source.endpoint_url).href;
    const result = await download(endpoint);
    const items = parseFeed(result.xml, result.url);
    return {adapter:`rss:${source.id}`,status:'succeeded',seen:items.length,candidates:items.map(item => rssCandidate(source,item,now))};
  } catch(error) {
    return {adapter:`rss:${source.id}`,status:'failed',seen:0,candidates:[],errorCode:'rss_source_unavailable',limitation:error instanceof Error ? error.message : 'Flux indisponibil.'};
  }
}

function trendsSignals(xml: string): Array<Record<string, unknown>> {
  try {
    const parsed = new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:true}).parse(xml);
    const entries = asArray(parsed.rss?.channel?.item ?? parsed.feed?.entry);
    return entries.map((entry,index) => {
      const traffic = asText(entry['ht:approx_traffic'] ?? entry['ht:approxTraffic']);
      const started = asText(entry['ht:news_item']?.['ht:news_item_source'] ?? entry['ht:started']);
      return {rank:index + 1, ...(traffic ? {approximateTraffic:traffic} : {}), ...(started ? {trendStarted:started} : {})};
    });
  } catch { return []; }
}

export async function discoverGoogleTrends(source: DiscoverySource, options: {download?: FeedDownloader; now?: Date} = {}): Promise<AdapterResult> {
  const download = options.download ?? downloadFeed;
  const now = (options.now ?? new Date()).toISOString();
  try {
    const endpoint = googleTrendsURL(source.endpoint_url).href;
    const result = await download(endpoint);
    const items = parseFeed(result.xml, result.url);
    const signals = trendsSignals(result.xml);
    const limitation='Google Trends indicates search interest and related news grouping; it does not establish truth or public importance.';
    const candidates = items.map((item,index) => ({...rssCandidate(source,item,now,signals[index] ?? {rank:index + 1}),provenance:{...rssCandidate(source,item,now,signals[index] ?? {rank:index + 1}).provenance,limitation}}));
    return {adapter:'google_trends_ro',status:'succeeded',seen:items.length,candidates,limitation};
  } catch(error) {
    return {adapter:'google_trends_ro',status:'failed',seen:0,candidates:[],errorCode:'google_trends_feed_unavailable',limitation:error instanceof Error ? error.message : 'Google Trends feed indisponibil.'};
  }
}

function youtubeCandidate(source: DiscoverySource, item: any, stats: any, observedAt: string, query: string): DiscoveryCandidateInput | null {
  const id = item?.id?.videoId;
  const snippet = item?.snippet;
  if(typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || !snippet?.title) return null;
  const originalUrl = `https://www.youtube.com/watch?v=${id}`;
  return {
    sourceId:source.id, sourceKind:source.kind, sourceName:source.name,
    originalUrl, canonicalUrl:originalUrl, title:String(snippet.title).slice(0,400),
    summary:typeof snippet.description === 'string' ? snippet.description.slice(0,1500) : null,
    observedAt, publishedAt:typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
    provenance:provenance(source,'youtube_data_api','Only public fields returned by the official YouTube Data API are stored; no page scraping or transcript extraction.'),
    popularitySignals:{query, ...(stats?.viewCount ? {viewCount:String(stats.viewCount)} : {}), ...(stats?.likeCount ? {likeCount:String(stats.likeCount)} : {}), ...(stats?.commentCount ? {commentCount:String(stats.commentCount)} : {})}
  };
}

export async function discoverYouTube(source: DiscoverySource, options: {apiKey?: string; fetcher?: JsonFetcher; now?: Date; queries?: string[]} = {}): Promise<AdapterResult> {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  if(!apiKey) return {adapter:'youtube_data_api_ro',status:'unavailable',seen:0,candidates:[],errorCode:'missing_youtube_api_key',limitation:'YOUTUBE_API_KEY is not configured; YouTube pages are not scraped.'};
  const fetcher = options.fetcher ?? fetch;
  const now = (options.now ?? new Date()).toISOString();
  const queries = options.queries ?? (process.env.YOUTUBE_DISCOVERY_QUERIES ?? 'știri România,actualitate România').split(',').map(value => value.trim()).filter(Boolean);
  try {
    const endpoint = youtubeAPIURL(source.endpoint_url).href;
    const results = await Promise.all(queries.slice(0,5).map(async query => {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({part:'snippet',type:'video',regionCode:'RO',relevanceLanguage:'ro',order:'date',maxResults:'10',q:query,key:apiKey}).toString();
      const response = await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`YouTube API HTTP ${response.status}.`);
      return {query,body:await response.json() as any};
    }));
    const ids = [...new Set(results.flatMap(result => (result.body.items ?? []).map((item:any) => item?.id?.videoId).filter((id:any): id is string => typeof id === 'string')))].slice(0,50);
    const stats = new Map<string,any>();
    if(ids.length) {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.search = new URLSearchParams({part:'statistics',id:ids.join(','),key:apiKey}).toString();
      const response = await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`YouTube API statistics HTTP ${response.status}.`);
      for(const item of ((await response.json() as any).items ?? [])) stats.set(item.id,item.statistics ?? {});
    }
    const candidates = results.flatMap(result => (result.body.items ?? []).map((item:any) => youtubeCandidate(source,item,stats.get(item?.id?.videoId),now,result.query)).filter(Boolean) as DiscoveryCandidateInput[]);
    return {adapter:'youtube_data_api_ro',status:'succeeded',seen:candidates.length,candidates,limitation:'YouTube counts are observed API fields, not a truth signal; search results are query- and region-dependent.'};
  } catch(error) {
    return {adapter:'youtube_data_api_ro',status:'failed',seen:0,candidates:[],errorCode:'youtube_api_unavailable',limitation:error instanceof Error ? error.message : 'YouTube API indisponibil.'};
  }
}

export function candidateId(canonicalUrl: string) {
  return `discovery-${createHash('sha256').update(canonicalUrl).digest('hex').slice(0,32)}`;
}

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

export function youtubeVideosAPIURL(value = 'https://www.googleapis.com/youtube/v3/videos') {
  return safeURL(value, 'www.googleapis.com', '/youtube/v3/videos');
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
    const candidates: DiscoveryCandidateInput[] = [];
    let failed = 0;
    for(const item of items) {
      try {candidates.push(rssCandidate(source,item,now));} catch {failed++;}
    }
    return {adapter:`rss:${source.id}`,status:failed ? (candidates.length ? 'partial' : 'failed') : 'succeeded',seen:items.length,candidates,failed,errorCode:failed?'candidate_transform_failed':undefined,limitation:failed?'Some feed items could not be normalized; the remaining items were retained.':undefined};
  } catch(error) {
    return {adapter:`rss:${source.id}`,status:'failed',seen:0,candidates:[],failed:1,errorCode:'rss_source_unavailable',limitation:error instanceof Error ? error.message : 'Flux indisponibil.'};
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
    const candidates: DiscoveryCandidateInput[] = [];
    let failed = 0;
    for(const [index,item] of items.entries()) {
      try {
        const candidate=rssCandidate(source,item,now,signals[index] ?? {rank:index + 1});
        candidates.push({...candidate,provenance:{...candidate.provenance,limitation}});
      } catch {failed++;}
    }
    return {adapter:'google_trends_ro',status:failed ? (candidates.length ? 'partial' : 'failed') : 'succeeded',seen:items.length,candidates,failed,errorCode:failed?'candidate_transform_failed':undefined,limitation};
  } catch(error) {
    return {adapter:'google_trends_ro',status:'failed',seen:0,candidates:[],failed:1,errorCode:'google_trends_feed_unavailable',limitation:error instanceof Error ? error.message : 'Google Trends feed indisponibil.'};
  }
}

function youtubeCandidate(source: DiscoverySource, item: any, stats: any, observedAt: string, query: string, mode: 'recent_search' | 'most_popular_chart'): DiscoveryCandidateInput | null {
  const id = typeof item?.id === 'string' ? item.id : item?.id?.videoId;
  const snippet = item?.snippet;
  if(typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || !snippet?.title) return null;
  const originalUrl = `https://www.youtube.com/watch?v=${id}`;
  return {
    sourceId:source.id, sourceKind:source.kind, sourceName:source.name,
    originalUrl, canonicalUrl:originalUrl, title:String(snippet.title).slice(0,400),
    summary:typeof snippet.description === 'string' ? snippet.description.slice(0,1500) : null,
    observedAt, publishedAt:typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
    provenance:{...provenance(source,'youtube_data_api','Only public fields returned by the official YouTube Data API are stored; no page scraping or transcript extraction.'),discoveryMode:mode},
    popularitySignals:{observation:mode,query, ...(stats?.viewCount ? {viewCount:String(stats.viewCount)} : {}), ...(stats?.likeCount ? {likeCount:String(stats.likeCount)} : {}), ...(stats?.commentCount ? {commentCount:String(stats.commentCount)} : {})}
  };
}

export async function discoverYouTube(source: DiscoverySource, options: {apiKey?: string; fetcher?: JsonFetcher; now?: Date; queries?: string[]} = {}): Promise<AdapterResult> {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  if(!apiKey) return {adapter:'youtube_data_api_ro',status:'unavailable',seen:0,candidates:[],failed:0,errorCode:'missing_youtube_api_key',limitation:'YOUTUBE_API_KEY is not configured; YouTube pages are not scraped.'};
  const fetcher = options.fetcher ?? fetch;
  const now = (options.now ?? new Date()).toISOString();
  // Two hourly search calls stay below YouTube's 100-call/day search.list default;
  // mostPopular and videos.list use the separate low-cost videos quota bucket.
  const queries = (options.queries ?? (process.env.YOUTUBE_DISCOVERY_QUERIES ?? 'știri România,actualitate România').split(',').map(value => value.trim()).filter(Boolean)).slice(0,2);
  try {
    const endpoint = youtubeAPIURL(source.endpoint_url).href;
    const results: Array<{query:string;body:any}> = [];
    let failed = 0;
    for(const query of queries) {
      try {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({part:'snippet',type:'video',regionCode:'RO',relevanceLanguage:'ro',order:'date',maxResults:'10',q:query,key:apiKey}).toString();
      const response = await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`YouTube API HTTP ${response.status}.`);
      results.push({query,body:await response.json() as any});
      } catch {failed++;}
    }
    const ids = [...new Set(results.flatMap(result => (result.body.items ?? []).map((item:any) => item?.id?.videoId).filter((id:any): id is string => typeof id === 'string')))].slice(0,50);
    const stats = new Map<string,any>();
    if(ids.length) {
      try {
        const url = new URL(youtubeVideosAPIURL().href);
        url.search = new URLSearchParams({part:'statistics',id:ids.join(','),key:apiKey}).toString();
        const response = await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok) throw new Error();
        for(const item of ((await response.json() as any).items ?? [])) stats.set(item.id,item.statistics ?? {});
      } catch {failed++;}
    }
    const candidates: DiscoveryCandidateInput[] = [];
    let seen = 0;
    for(const result of results) for(const item of (result.body.items ?? [])) {
      seen++;
      try {const candidate=youtubeCandidate(source,item,stats.get(item?.id?.videoId),now,result.query,'recent_search');if(candidate) candidates.push(candidate); else failed++;} catch {failed++;}
    }
    try {
      const url = new URL(youtubeVideosAPIURL().href);
      url.search = new URLSearchParams({part:'snippet,statistics',chart:'mostPopular',regionCode:'RO',maxResults:'10',key:apiKey}).toString();
      const response = await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error();
      for(const item of ((await response.json() as any).items ?? [])) {
        seen++;
        try {const candidate=youtubeCandidate(source,item,item?.statistics,now,'mostPopular:RO','most_popular_chart');if(candidate) candidates.push(candidate); else failed++;} catch {failed++;}
      }
    } catch {failed++;}
    const status=failed ? (candidates.length ? 'partial' : 'failed') : 'succeeded';
    return {adapter:'youtube_data_api_ro',status,seen,candidates,failed,errorCode:failed?'youtube_partial_failure':undefined,limitation:'Recent search results and the official mostPopular Romania chart are separate signals. Counts are observed API fields, not a truth signal; search results are query- and region-dependent.'};
  } catch(error) {
    return {adapter:'youtube_data_api_ro',status:'failed',seen:0,candidates:[],failed:1,errorCode:'youtube_api_unavailable',limitation:error instanceof Error ? error.message : 'YouTube API indisponibil.'};
  }
}

export function candidateId(canonicalUrl: string) {
  return `discovery-${createHash('sha256').update(canonicalUrl).digest('hex').slice(0,32)}`;
}

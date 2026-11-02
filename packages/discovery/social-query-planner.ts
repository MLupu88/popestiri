// P0-S1/S2: read-only, bounded planning for official YouTube discovery.
// Social titles are untrusted search seeds, never verified claims or evidence.
export type SocialSeedKind = 'youtube_claim' | 'youtube_video';
export type SocialQuerySeed = {
  id: string;
  kind: SocialSeedKind;
  text: string;
  observedAt: string;
};

export type PlannedSocialQuery = {
  platform: 'youtube';
  query: string;
  seedId: string;
  seedKind: SocialSeedKind;
  observedAt: string;
  selectionReason: 'existing_social_claim' | 'recent_public_video_title';
};

export type SocialSourceCoverage = {
  platform: 'youtube' | 'tiktok' | 'facebook';
  status: 'ready_to_probe' | 'unavailable';
  reason: string;
};

export const MAX_SOCIAL_YOUTUBE_QUERIES = 2;
const MAX_SEED_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const genericBroadcast = /\b(?:stirile|știrile|buletinul|jurnalul)\b.{0,65}\b(?:azi|astăzi|astazi|ora|octombrie|noiembrie|2026)\b/i;
const entertainment = /\b(?:official video|official audio|lyrics|gaming|gameplay|concert|remix|trailer|prank)\b/i;
const malicious = /ignore previous instructions|system prompt|\[tool_call\]|<script|javascript:/i;

function safeQuery(text: string): string | null {
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 20 || genericBroadcast.test(cleaned) || entertainment.test(cleaned) || malicious.test(cleaned)) return null;
  // Query text is ONLY a search string. Never treat truncated text as a claim.
  const limited = cleaned.length <= 120 ? cleaned : cleaned.slice(0, 121).replace(/\s+\S*$/, '').trim();
  if (limited.length < 20 || limited.split(/\s+/).length < 3) return null;
  return limited;
}

function dedupKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function planSocialYouTubeQueries(
  seeds: ReadonlyArray<SocialQuerySeed>,
  options: { now?: Date; maxQueries?: number } = {}
): PlannedSocialQuery[] {
  const max = options.maxQueries ?? MAX_SOCIAL_YOUTUBE_QUERIES;
  if (!Number.isSafeInteger(max) || max < 0 || max > MAX_SOCIAL_YOUTUBE_QUERIES) {
    throw new Error('maxQueries must be an integer between 0 and 2.');
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('now must be a valid date.');
  const eligible: Array<{ seed: SocialQuerySeed; query: string; time: number }> = [];
  for (const seed of seeds) {
    if (!seed || (seed.kind !== 'youtube_claim' && seed.kind !== 'youtube_video') || !seed.id || typeof seed.text !== 'string') continue;
    const time = Date.parse(seed.observedAt);
    if (!Number.isFinite(time) || time > now.getTime() + FUTURE_SKEW_MS || now.getTime() - time > MAX_SEED_AGE_MS) continue;
    const query = safeQuery(seed.text);
    if (query) eligible.push({seed,query,time});
  }
  eligible.sort((a,b)=>
    (a.seed.kind === b.seed.kind ? 0 : a.seed.kind === 'youtube_claim' ? -1 : 1) ||
    b.time - a.time || a.seed.id.localeCompare(b.seed.id)
  );
  const used = new Set<string>();
  const result: PlannedSocialQuery[] = [];
  for (const item of eligible) {
    if (result.length >= max) break;
    const key = dedupKey(item.query);
    if (used.has(key)) continue;
    used.add(key);
    result.push({
      platform:'youtube',query:item.query,seedId:item.seed.id,seedKind:item.seed.kind,
      observedAt:new Date(item.time).toISOString(),
      selectionReason:item.seed.kind === 'youtube_claim' ? 'existing_social_claim' : 'recent_public_video_title'
    });
  }
  return result;
}

export function socialSourceCoverage(options: {youtubeSourceEnabled:boolean;youtubeKeyConfigured:boolean}): SocialSourceCoverage[] {
  return [
    {platform:'tiktok',status:'unavailable',reason:'No approved editorial provider / access configured. Academic Research API data are not an editorial feed.'},
    {platform:'facebook',status:'unavailable',reason:'No approved public Page access or licensed provider configured. Private posts/groups are out of scope.'},
    {platform:'youtube',
      status:options.youtubeSourceEnabled && options.youtubeKeyConfigured ? 'ready_to_probe' : 'unavailable',
      reason:!options.youtubeSourceEnabled ? 'No enabled YouTube source in registry.' : !options.youtubeKeyConfigured ? 'YOUTUBE_API_KEY not configured.' : 'Official YouTube Data API available for bounded read-only probe; coverage is incomplete.'}
  ];
}

import pg from 'pg';
import {discoverYouTube} from '../../packages/discovery/adapters.ts';
import {loadAutomatedSources} from '../../packages/discovery/service.ts';
import {planSocialYouTubeQueries, socialSourceCoverage, type SocialQuerySeed} from '../../packages/discovery/social-query-planner.ts';

// This CLI never inserts/updates database rows. A live API probe is an explicit
// opt-in and is bounded by the existing discoverYouTube maximum of two queries.
const argv = process.argv.slice(2);
if (argv.length !== 1 || !['--preview','--probe-youtube'].includes(argv[0])) {
  console.error('Usage: node apps/worker/social-discovery-preview.ts --preview | --probe-youtube');
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required.');
const probe = argv[0] === '--probe-youtube';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,statement_timeout:12000});

try {
  // Social sources only: no RSS headline is eligible to seed this query plan.
  const claims = await pool.query(
    `SELECT l.id, l.assertion_text AS text, l.last_observed_at AS observed_at
     FROM claim_leads l
     WHERE l.classification='testable_claim' AND l.assertion_text IS NOT NULL
       AND l.last_observed_at >= now()-interval '7 days'
       AND EXISTS (
         SELECT 1 FROM claim_lead_references r
         JOIN discovery_candidates c ON c.id=r.candidate_id
         WHERE r.claim_lead_id=l.id AND c.source_kind='youtube_api'
       )
     ORDER BY l.last_observed_at DESC, l.id LIMIT 40`
  );
  const videos = await pool.query(
    `SELECT id, title AS text, observed_at
     FROM discovery_candidates
     WHERE source_kind='youtube_api' AND observed_at >= now()-interval '7 days'
     ORDER BY observed_at DESC, id LIMIT 120`
  );
  const date = (value: unknown) => new Date(String(value)).toISOString();
  const seeds: SocialQuerySeed[] = [
    ...claims.rows.map(row=>({id:String(row.id),kind:'youtube_claim' as const,text:String(row.text),observedAt:date(row.observed_at)})),
    ...videos.rows.map(row=>({id:String(row.id),kind:'youtube_video' as const,text:String(row.text),observedAt:date(row.observed_at)}))
  ];
  const queries = planSocialYouTubeQueries(seeds);
  const sources = await loadAutomatedSources(pool);
  const source = sources.find(item=>item.kind==='youtube_api');
  const coverage = socialSourceCoverage({youtubeSourceEnabled:Boolean(source),youtubeKeyConfigured:Boolean(process.env.YOUTUBE_API_KEY)});
  console.log(JSON.stringify({
    event:'social_discovery_plan',mode:probe?'explicit_api_probe':'read_only_preview',
    seedCount:seeds.length,queryCount:queries.length,maximumSearchQueries:2,
    queries,coverage,
    limitation:'Public video titles are search hints, not fact-checked claims or proof of virality. TikTok/Facebook editorial connectors are unavailable.'
  }));
  if (probe) {
    if (!source || !process.env.YOUTUBE_API_KEY || queries.length===0) {
      console.log(JSON.stringify({event:'social_discovery_probe',status:'unavailable',reason:!source?'missing_registered_source':!process.env.YOUTUBE_API_KEY?'missing_key':'no_eligible_social_seeds',apiCallsAttempted:0}));
    } else {
      const result = await discoverYouTube(source,{apiKey:process.env.YOUTUBE_API_KEY,queries:queries.map(item=>item.query)});
      console.log(JSON.stringify({
        event:'social_discovery_probe',status:result.status,seen:result.seen,failed:result.failed,candidateCount:result.candidates.length,
        errorCode:result.errorCode,limitation:result.limitation,
        sample:result.candidates.slice(0,8).map(item=>({originalUrl:item.originalUrl,title:item.title,observedAt:item.observedAt,videoId:item.provenance.videoId,discoveryMode:item.provenance.discoveryMode,signals:item.popularitySignals}))
      }));
      if (result.status==='failed') process.exitCode=1;
    }
  }
} finally {
  await pool.end();
}

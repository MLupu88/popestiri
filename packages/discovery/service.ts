import type pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {discoverGoogleTrends, discoverRSS, discoverYouTube, candidateId} from './adapters.ts';
import type {DiscoveryCandidateInput, DiscoverySource, AdapterResult} from './types.ts';

const LOCK_KEY = 'popestiri:discovery-foundation';
const stopWords = new Set('și sau din pentru cu este sunt cele mai care unui unei către despre după între fără prin acest această aceste aceea acelea după iar dar nu o un unei la de a în pe al ai ale se ce ca cum dintr'.split(' '));

function titleTokens(title: string) {
  return [...new Set(title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9ăâîșț]+/gi,' ').split(/\s+/).filter(word => word.length >= 4 && !stopWords.has(word)))].sort();
}

export function conservativeGroupingKey(title: string) {
  const tokens = titleTokens(title);
  return tokens.length >= 3 ? tokens.join('|') : null;
}

async function loadSources(pool: pg.Pool): Promise<DiscoverySource[]> {
  return (await pool.query(`SELECT * FROM discovery_source_registry WHERE enabled=true ORDER BY kind,name,id`)).rows as DiscoverySource[];
}

async function persistCandidate(pool: pg.Pool, candidate: DiscoveryCandidateInput) {
  const id = candidateId(candidate.canonicalUrl);
  const result = await pool.query(`
    INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,summary,observed_at,published_at,provenance,popularity_signals)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(canonical_url) DO UPDATE SET
      last_seen_at=now(), updated_at=now(), observed_at=GREATEST(discovery_candidates.observed_at,EXCLUDED.observed_at),
      provenance=discovery_candidates.provenance || EXCLUDED.provenance,
      popularity_signals=discovery_candidates.popularity_signals || EXCLUDED.popularity_signals
    RETURNING (xmax=0) AS inserted
  `,[id,candidate.sourceId,candidate.sourceKind,candidate.sourceName,candidate.originalUrl,candidate.canonicalUrl,candidate.title,candidate.summary,candidate.observedAt,candidate.publishedAt,JSON.stringify(candidate.provenance),JSON.stringify(candidate.popularitySignals ?? {})]);
  return Boolean(result.rows[0]?.inserted);
}

async function groupRecentCandidates(pool: pg.Pool) {
  const rows = (await pool.query(`SELECT id,title,observed_at FROM discovery_candidates WHERE observed_at >= now()-interval '7 days' ORDER BY observed_at DESC LIMIT 500`)).rows;
  let updated = 0;
  for(const row of rows) {
    const key = conservativeGroupingKey(row.title);
    if(!key) continue;
    // Same headline tokens on different days are not assumed to be one event.
    const groupingKey = `${key}|${new Date(row.observed_at).toISOString().slice(0,10)}`;
    const id = `group-${createHash('sha256').update(groupingKey).digest('hex').slice(0,32)}`;
    const group = await pool.query(`
      INSERT INTO discovery_groups(id,grouping_key,title,method,first_seen,last_seen)
      VALUES($1,$2,$3,'conservative_title_overlap',$4,$4)
      ON CONFLICT(grouping_key) DO UPDATE SET last_seen=GREATEST(discovery_groups.last_seen,EXCLUDED.last_seen),updated_at=now()
      RETURNING id
    `,[id,groupingKey,row.title,row.observed_at]);
    const groupId = group.rows[0]?.id ?? id;
    const member = await pool.query(`INSERT INTO discovery_group_members(group_id,candidate_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[groupId,row.id]);
    updated += member.rowCount ?? 0;
  }
  return updated;
}

async function logAdapter(pool: pg.Pool, runId: string, result: AdapterResult, elapsedMs: number) {
  await pool.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value) VALUES($1,'discovery_run',$2,$3,'worker',$4,$5)`,[
    randomUUID(),runId,`discovery_${result.status}`,`Discovery adapter ${result.adapter} completed.`,JSON.stringify({adapter:result.adapter,status:result.status,seen:result.seen,errorCode:result.errorCode,limitation:result.limitation,elapsedMs})
  ]);
}

async function runAdapter(source: DiscoverySource): Promise<AdapterResult> {
  if(source.kind === 'rss') return discoverRSS(source);
  if(source.kind === 'google_trends') return discoverGoogleTrends(source);
  if(source.kind === 'youtube_api') return discoverYouTube(source);
  return {adapter:source.kind,status:'unavailable',seen:0,candidates:[],errorCode:'unsupported_discovery_source',limitation:'Source type is not automated in this milestone.'};
}

export type DiscoveryRunSummary = {
  skipped: boolean;
  status: 'succeeded' | 'partial' | 'failed' | 'skipped';
  adapters: Array<{adapter:string;status:AdapterResult['status'];seen:number;added:number;errorCode?:string;limitation?:string}>;
  candidatesSeen: number;
  candidatesAdded: number;
  groupsUpdated: number;
  elapsedMs: number;
};

export async function runDiscovery(pool: pg.Pool): Promise<DiscoveryRunSummary> {
  const started = performance.now();
  const lock = await pool.connect();
  let locked = false;
  let runId: string | null = null;
  const empty = (skipped: boolean): DiscoveryRunSummary => ({skipped,status:skipped?'skipped':'succeeded',adapters:[],candidatesSeen:0,candidatesAdded:0,groupsUpdated:0,elapsedMs:Math.round(performance.now()-started)});
  try {
    locked = Boolean((await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[LOCK_KEY])).rows[0]?.acquired);
    if(!locked) return empty(true);
    runId = `discovery-run-${randomUUID()}`;
    await pool.query(`INSERT INTO discovery_runs(id,status) VALUES($1,'running')`,[runId]);
    const sources = await loadSources(pool);
    const adapterResults: DiscoveryRunSummary['adapters'] = [];
    let candidatesSeen = 0, candidatesAdded = 0;
    for(const source of sources) {
      const adapterStarted = performance.now();
      const result = await runAdapter(source);
      let added = 0;
      for(const candidate of result.candidates) if(await persistCandidate(pool,candidate)) added++;
      candidatesSeen += result.seen; candidatesAdded += added;
      adapterResults.push({adapter:result.adapter,status:result.status,seen:result.seen,added,errorCode:result.errorCode,limitation:result.limitation});
      await logAdapter(pool,runId,result,Math.round(performance.now()-adapterStarted));
    }
    const groupsUpdated = await groupRecentCandidates(pool);
    const hasFailure = adapterResults.some(result => result.status === 'failed' || result.status === 'unavailable');
    const status = hasFailure ? (adapterResults.some(result => result.status === 'succeeded') ? 'partial' : 'failed') : 'succeeded';
    const summary = {skipped:false,status,adapters:adapterResults,candidatesSeen,candidatesAdded,groupsUpdated,elapsedMs:Math.round(performance.now()-started)} as DiscoveryRunSummary;
    await pool.query(`UPDATE discovery_runs SET finished_at=now(),status=$2,adapter_results=$3,candidates_seen=$4,candidates_added=$5,groups_updated=$6 WHERE id=$1`,[runId,status,JSON.stringify(adapterResults),candidatesSeen,candidatesAdded,groupsUpdated]);
    await pool.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value) VALUES($1,'discovery_run',$2,'discovery_run_finished','worker','Automated discovery run completed.',$3)`,[randomUUID(),runId,JSON.stringify(summary)]);
    return summary;
  } catch(error) {
    // The run itself is best-effort. Do not turn a discovery problem into an RSS failure.
    if(runId) {
      try {
        await pool.query(`UPDATE discovery_runs SET finished_at=now(),status='failed',error_code='discovery_infrastructure_failure' WHERE id=$1`,[runId]);
        await pool.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value) VALUES($1,'discovery_run',$2,'discovery_run_failed','worker','Discovery infrastructure failure.',$3)`,[randomUUID(),runId,JSON.stringify({errorCode:'discovery_infrastructure_failure'})]);
      } catch {}
    }
    console.error(JSON.stringify({event:'discovery_run_failed',errorCode:'discovery_infrastructure_failure'}));
    return {...empty(false),status:'failed'};
  } finally {
    if(locked) try {await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[LOCK_KEY]);} catch {}
    lock.release();
  }
}

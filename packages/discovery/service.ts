import type pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {discoverGoogleTrends, discoverRSS, discoverYouTube, candidateId} from './adapters.ts';
import type {DiscoveryCandidateInput, DiscoverySource, AdapterResult} from './types.ts';
import {runClaimRadar} from '../claims/service.ts';

const LOCK_KEY = 'popestiri:discovery-foundation';
const stopWords = new Set('și sau din pentru cu este sunt cele mai care unui unei către despre după între fără prin acest această aceste aceea acelea după iar dar nu o un unei la de a în pe al ai ale se ce ca cum dintr'.split(' '));
const groupingStopWords = new Set([...stopWords, 'stiri', 'știri', 'romania', 'românia', 'anunta', 'anunță', 'anuntat', 'spune', 'spus', 'potrivit', 'astazi', 'astăzi', 'acum', 'nou', 'noi', 'fost', 'fiind', 'face', 'facut', 'făcut', 'guvernul', 'ministerul', 'presedintele', 'președintele']);

function titleTokens(title: string) {
  return [...new Set(title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9ăâîșț]+/gi,' ').split(/\s+/).filter(word => word.length >= 4 && !stopWords.has(word)))].sort();
}

export function conservativeGroupingKey(title: string) {
  const tokens = titleTokens(title);
  return tokens.length >= 3 ? tokens.join('|') : null;
}

type GroupingCandidate = {
  id: string;
  title: string;
  source_id: string;
  source_name: string;
  observed_at: string;
  published_at?: string | null;
};

function groupingTokens(title: string) {
  return [...new Set(title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter(token => token.length >= 5 && !groupingStopWords.has(token)))];
}

function candidateTime(candidate: Pick<GroupingCandidate, 'observed_at' | 'published_at'>) {
  const value = candidate.published_at || candidate.observed_at;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Date.parse(candidate.observed_at);
}

/**
 * A deliberately narrow, explainable lead matcher. It is not an event or truth
 * classifier: three shared non-generic title tokens, different registered
 * sources, and a 72-hour window are required before candidates can be grouped.
 */
export function relatedDiscoveryCandidates(left: GroupingCandidate, right: GroupingCandidate) {
  if (left.source_id === right.source_id) return false;
  const leftTime = candidateTime(left);
  const rightTime = candidateTime(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || Math.abs(leftTime - rightTime) > 72 * 60 * 60 * 1000) return false;
  const rightTokens = new Set(groupingTokens(right.title));
  const overlap = groupingTokens(left.title).filter(token => rightTokens.has(token));
  if (overlap.length < 3) return false;
  const union = new Set([...groupingTokens(left.title), ...rightTokens]);
  return overlap.length / union.size >= 0.3;
}

export function topicComponents(candidates: GroupingCandidate[]) {
  const groups: GroupingCandidate[][] = [];
  const ordered = [...candidates].sort((left, right) => candidateTime(left) - candidateTime(right) || left.id.localeCompare(right.id));
  for (const candidate of ordered) {
    const compatible = groups.filter(group => {
      const times = [...group, candidate].map(candidateInGroup => candidateTime(candidateInGroup));
      const span = Math.max(...times) - Math.min(...times);
      return span <= 72 * 60 * 60 * 1000 && group.every(member => relatedDiscoveryCandidates(member, candidate));
    });
    // A candidate joins at most one group, and must match every existing
    // member. This deliberately prevents A-B plus B-C from becoming A-B-C.
    if (compatible.length) {
      compatible.sort((left, right) => right.length - left.length || left.map(member => member.id).sort().join('|').localeCompare(right.map(member => member.id).sort().join('|')));
      compatible[0].push(candidate);
    } else {
      groups.push([candidate]);
    }
  }
  return groups.filter(group => new Set(group.map(candidate => candidate.source_id)).size >= 2);
}

function observationKey(value: Record<string, unknown>) {
  return [value.registryId,value.adapter,value.discoveryMode,value.sourceName,JSON.stringify(value)].filter(Boolean).join('|');
}

export function mergeObservationEnvelope(existing: unknown, incoming: Record<string, unknown>) {
  const old = existing && typeof existing === 'object' && Array.isArray((existing as any).observations)
    ? (existing as any).observations
    : existing && typeof existing === 'object' && Object.keys(existing as object).length ? [existing]
    : [];
  const observations=[...old,incoming] as Record<string, unknown>[];
  const seen=new Set<string>();
  return {observations:observations.filter(value=>{const key=observationKey(value);if(seen.has(key)) return false;seen.add(key);return true;})};
}

export async function loadAutomatedSources(pool: pg.Pool): Promise<DiscoverySource[]> {
  return (await pool.query(`SELECT * FROM discovery_source_registry WHERE enabled=true AND kind <> 'social_intake' ORDER BY kind,name,id`)).rows as DiscoverySource[];
}

export async function persistDiscoveryCandidate(pool: pg.Pool, candidate: DiscoveryCandidateInput) {
  const id = candidateId(candidate.canonicalUrl);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,summary,observed_at,published_at,provenance,popularity_signals)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(canonical_url) DO NOTHING
      RETURNING id
    `,[id,candidate.sourceId,candidate.sourceKind,candidate.sourceName,candidate.originalUrl,candidate.canonicalUrl,candidate.title,candidate.summary,candidate.observedAt,candidate.publishedAt,JSON.stringify(mergeObservationEnvelope({},candidate.provenance)),JSON.stringify(mergeObservationEnvelope({},candidate.popularitySignals ?? {}))]);
    if(result.rowCount) {await client.query('COMMIT');return true;}
    const existing=(await client.query(`SELECT provenance,popularity_signals FROM discovery_candidates WHERE canonical_url=$1 FOR UPDATE`,[candidate.canonicalUrl])).rows[0];
    if(!existing) throw new Error('Candidate disappeared during deduplication.');
    await client.query(`UPDATE discovery_candidates SET last_seen_at=now(),updated_at=now(),observed_at=GREATEST(observed_at,$2),provenance=$3,popularity_signals=$4 WHERE canonical_url=$1`,[candidate.canonicalUrl,candidate.observedAt,JSON.stringify(mergeObservationEnvelope(existing.provenance,candidate.provenance)),JSON.stringify(mergeObservationEnvelope(existing.popularity_signals,candidate.popularitySignals ?? {}))]);
    await client.query('COMMIT');
    return false;
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

async function clearHeuristicGroups(client: pg.PoolClient) {
  await client.query(`DELETE FROM discovery_group_members WHERE group_id IN (SELECT id FROM discovery_groups WHERE method IN ('conservative_title_overlap','lexical_multi_source_v1'))`);
  await client.query(`DELETE FROM discovery_groups WHERE method IN ('conservative_title_overlap','lexical_multi_source_v1')`);
}

export async function groupRecentCandidates(pool: pg.Pool) {
  // Reconciliation is intentionally idempotent. It only rebuilds heuristic
  // membership; candidates, submissions, provenance and evidence are never
  // deleted or rewritten.
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await clearHeuristicGroups(client);
    const rows = (await client.query(`SELECT id,title,source_id,source_name,observed_at,published_at
      FROM discovery_candidates
      WHERE observed_at >= now()-interval '7 days'
      ORDER BY observed_at DESC,id
      LIMIT 500`)).rows as GroupingCandidate[];
    const components = topicComponents(rows);
    let updated = 0;
    for (const component of components) {
      const members = [...component].sort((left, right) => candidateTime(left) - candidateTime(right) || left.id.localeCompare(right.id));
      const groupingKey = `lexical_multi_source_v1|${members.map(member => member.id).sort().join('|')}`;
      const id = `group-${createHash('sha256').update(groupingKey).digest('hex').slice(0,32)}`;
      const firstSeen = new Date(Math.min(...members.map(candidate => candidateTime(candidate)))).toISOString();
      const lastSeen = new Date(Math.max(...members.map(candidate => candidateTime(candidate)))).toISOString();
      await client.query(`INSERT INTO discovery_groups(id,grouping_key,title,method,provisional,first_seen,last_seen)
        VALUES($1,$2,$3,'lexical_multi_source_v1',true,$4,$5)`,
        [id, groupingKey, members[0].title, firstSeen, lastSeen]);
      for (const member of members) {
        await client.query(`INSERT INTO discovery_group_members(group_id,candidate_id) VALUES($1,$2)`, [id, member.id]);
      }
      updated++;
    }
    await client.query('COMMIT');
    return updated;
  } catch(error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function logAdapter(pool: pg.Pool, runId: string, result: AdapterResult, elapsedMs: number) {
  await pool.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value) VALUES($1,'discovery_run',$2,$3,'worker',$4,$5)`,[
    randomUUID(),runId,`discovery_${result.status}`,`Discovery adapter ${result.adapter} completed.`,JSON.stringify({adapter:result.adapter,status:result.status,seen:result.seen,failed:result.failed,errorCode:result.errorCode,limitation:result.limitation,elapsedMs})
  ]);
}

async function runSourceAdapter(source: DiscoverySource): Promise<AdapterResult> {
  if(source.kind === 'rss') return discoverRSS(source);
  if(source.kind === 'google_trends') return discoverGoogleTrends(source);
  if(source.kind === 'youtube_api') return discoverYouTube(source);
  return {adapter:source.kind,status:'unavailable',seen:0,candidates:[],failed:0,errorCode:'unsupported_discovery_source',limitation:'Source type is not automated in this milestone.'};
}

export type DiscoveryRunSummary = {
  skipped: boolean;
  status: 'succeeded' | 'partial' | 'failed' | 'skipped';
  adapters: Array<{adapter:string;status:AdapterResult['status'];seen:number;failed:number;added:number;errorCode?:string;limitation?:string}>;
  candidatesSeen: number;
  candidatesAdded: number;
  groupsUpdated: number;
  claimRadar: {candidates:number; leads:number; failed:number; method:string};
  elapsedMs: number;
};

export async function runDiscovery(pool: pg.Pool, options: {adapter?: (source: DiscoverySource) => Promise<AdapterResult>} = {}): Promise<DiscoveryRunSummary> {
  const started = performance.now();
  const lock = await pool.connect();
  let locked = false;
  let runId: string | null = null;
  const empty = (skipped: boolean): DiscoveryRunSummary => ({skipped,status:skipped?'skipped':'succeeded',adapters:[],candidatesSeen:0,candidatesAdded:0,groupsUpdated:0,claimRadar:{candidates:0,leads:0,failed:0,method:'not_run'},elapsedMs:Math.round(performance.now()-started)});
  try {
    locked = Boolean((await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[LOCK_KEY])).rows[0]?.acquired);
    if(!locked) return empty(true);
    runId = `discovery-run-${randomUUID()}`;
    await pool.query(`INSERT INTO discovery_runs(id,status) VALUES($1,'running')`,[runId]);
    const sources = await loadAutomatedSources(pool);
    const adapterResults: DiscoveryRunSummary['adapters'] = [];
    let candidatesSeen = 0, candidatesAdded = 0;
    for(const source of sources) {
      const adapterStarted = performance.now();
      let result: AdapterResult;
      try {result = await (options.adapter ?? runSourceAdapter)(source);} catch(error) {
        result={adapter:`${source.kind}:${source.id}`,status:'failed',seen:0,candidates:[],failed:1,errorCode:'adapter_source_failure',limitation:error instanceof Error ? error.message : 'Adaptorul a eșuat.'};
      }
      let added = 0;
      let failed = result.failed;
      for(const candidate of result.candidates) {
        try {if(await persistDiscoveryCandidate(pool,candidate)) added++;}
        catch {failed++;}
      }
      const status: AdapterResult['status'] = failed && result.status === 'succeeded' ? 'partial' : failed && result.status === 'partial' && !result.candidates.length ? 'failed' : result.status;
      candidatesSeen += result.seen; candidatesAdded += added;
      adapterResults.push({adapter:result.adapter,status,seen:result.seen,failed,added,errorCode:result.errorCode,limitation:result.limitation});
      await logAdapter(pool,runId,{...result,status,failed},Math.round(performance.now()-adapterStarted));
    }
    const groupsUpdated = await groupRecentCandidates(pool);
    let claimRadar: DiscoveryRunSummary['claimRadar'] = {candidates:0,leads:0,failed:0,method:'migration_pending'};
    if((await pool.query("SELECT to_regclass('claim_leads') AS name")).rows[0]?.name) {
      try {claimRadar=await runClaimRadar(pool);} catch {claimRadar={...claimRadar,failed:1,method:'failed'};}
    }
    const hasFailure = adapterResults.some(result => result.status === 'failed' || result.status === 'partial' || result.status === 'unavailable' || result.failed > 0) || claimRadar.failed>0;
    const status = hasFailure ? ((candidatesAdded > 0 || adapterResults.some(result => result.status === 'succeeded')) ? 'partial' : 'failed') : 'succeeded';
    const summary = {skipped:false,status,adapters:adapterResults,candidatesSeen,candidatesAdded,groupsUpdated,claimRadar,elapsedMs:Math.round(performance.now()-started)} as DiscoveryRunSummary;
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

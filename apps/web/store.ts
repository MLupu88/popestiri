import {createHash, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {feedURL} from '../../packages/connectors/rss.ts';
import {importSource, saveFeedItems} from '../../packages/ingestion/rss.ts';
import {mergeObservationEnvelope} from '../../packages/discovery/service.ts';
export {importSource, saveFeedItems} from '../../packages/ingestion/rss.ts';

export const socialPlatforms = ['facebook','tiktok','youtube'] as const;
export type SocialPlatform = typeof socialPlatforms[number];
export const socialStatuses = ['new','reviewing','investigating','closed'] as const;
export type SocialStatus = typeof socialStatuses[number];
export class SocialInputError extends Error {
  constructor(message: string) {super(message);this.name='SocialInputError';}
}
export type SocialEnrichment = {
  claimDescription: string;
  investigationReason: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  notes?: string;
};

const socialLabels: Record<SocialPlatform,string> = {facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube'};
const socialHost = (host: string, domain: string) => host===domain || host.endsWith(`.${domain}`);
const trackingParameters = new Set(['fbclid','gclid','dclid','gbraid','wbraid','msclkid','mc_cid','mc_eid','igshid','si','feature','ref_src','ref_url','is_from_webapp','sender_device','sender_web_id']);
const youtubePresentationParameters = new Set(['t','start','end']);

function isTrackingParameter(name: string) {
  const key=name.toLowerCase();
  return key.startsWith('utm_') || trackingParameters.has(key);
}

function cleanParameters(parsed: URL, youtubeVideo: boolean) {
  const cleaned=new URLSearchParams();
  for(const [name,value] of parsed.searchParams) {
    const key=name.toLowerCase();
    if(isTrackingParameter(key) || (youtubeVideo && youtubePresentationParameters.has(key))) continue;
    cleaned.append(name,value);
  }
  cleaned.sort();
  return cleaned;
}

function youtubeVideoId(parsed: URL) {
  const segments=parsed.pathname.split('/').filter(Boolean);
  let candidate: string | null = null;
  if(parsed.hostname.toLowerCase()==='youtu.be') candidate=segments.length===1 ? segments[0] : null;
  else if(segments[0]?.toLowerCase()==='watch') candidate=parsed.searchParams.get('v');
  else if(['shorts','embed','live'].includes(segments[0]?.toLowerCase()??'')) candidate=segments[1]??null;
  if(!candidate) return null;
  try {candidate=decodeURIComponent(candidate);} catch {return null;}
  return /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : null;
}

function validation(message: string): never {throw new SocialInputError(message);}

export function socialURL(input: string) {
  if(input.length===0 || input.length>2048) validation('Adresa trebuie să aibă între 1 și 2048 de caractere.');
  let parsed: URL;
  try {parsed=new URL(input);} catch {validation('Adresa socială nu este validă.');}
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port) validation('Folosește o adresă HTTPS publică, fără credențiale sau port personalizat.');
  const host=parsed.hostname.toLowerCase();
  let platform: SocialPlatform | undefined;
  if(socialHost(host,'facebook.com') || host==='fb.watch') platform='facebook';
  else if(socialHost(host,'tiktok.com')) platform='tiktok';
  else if(socialHost(host,'youtube.com') || host==='youtu.be') platform='youtube';
  if(!platform || parsed.pathname==='/' || parsed.pathname==='') validation('Acceptăm doar linkuri publice Facebook, TikTok sau YouTube.');
  const videoId=platform==='youtube' ? youtubeVideoId(parsed) : null;
  parsed.hash='';
  if(platform==='youtube' && videoId){
    const normalized=new URLSearchParams(cleanParameters(parsed,true));
    for(const key of [...normalized.keys()]) if(key.toLowerCase()==='v') normalized.delete(key);
    normalized.set('v',videoId);
    normalized.sort();
    parsed.protocol='https:';
    parsed.hostname='www.youtube.com';
    parsed.port='';
    parsed.pathname='/watch';
    parsed.search=normalized.toString() ? `?${normalized.toString()}` : '';
  } else {
    parsed.search=cleanParameters(parsed,false).toString();
  }
  return {platform,originalUrl:input,canonicalUrl:parsed.href};
}

function requiredText(value: string, label: string, max: number) {
  const text=value.trim();
  if(!text || text.length>max || text.includes('\0')) validation(`${label} trebuie să aibă între 1 și ${max} de caractere.`);
  return text;
}

function optionalText(value: string | undefined, label: string, max: number) {
  const text=(value??'').trim();
  if(text.length>max || text.includes('\0')) validation(`${label} nu poate depăși ${max} de caractere.`);
  return text || undefined;
}

function status(value: string): SocialStatus {
  if(!socialStatuses.includes(value as SocialStatus)) validation('Starea editorială nu este validă.');
  return value as SocialStatus;
}

function platform(value: string): SocialPlatform {
  if(!socialPlatforms.includes(value as SocialPlatform)) validation('Platforma nu este validă.');
  return value as SocialPlatform;
}

export function socialPlatformLabel(value: string) {return socialLabels[value as SocialPlatform] ?? value;}

export async function addSocialSubmission(pool: pg.Pool, input: {url: string; submissionSource: string; claimDescription: string; investigationReason: string}) {
  const parsed=socialURL(input.url);
  const submissionSource=requiredText(input.submissionSource,'Sursa semnalului',200);
  const claimDescription=requiredText(input.claimDescription,'Descrierea afirmației',1000);
  const investigationReason=requiredText(input.investigationReason,'Motivul investigației',1000);
  const id=`social-${createHash('sha256').update(parsed.canonicalUrl).digest('hex').slice(0,32)}`;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted=await client.query(`INSERT INTO social_intake_items(id,original_url,canonical_url,platform,submission_source,claim_description,investigation_reason)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(canonical_url) DO NOTHING RETURNING id`,[id,parsed.originalUrl,parsed.canonicalUrl,parsed.platform,submissionSource,claimDescription,investigationReason]);
    const duplicate=!inserted.rowCount;
    const itemId=inserted.rows[0]?.id ?? id;
    await client.query(`INSERT INTO social_intake_provenance(id,intake_id,original_url,submission_source,claim_description,investigation_reason)
      VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),itemId,parsed.originalUrl,submissionSource,claimDescription,investigationReason]);
    // M0.3C.1 keeps the manual channel supplementary, but makes it visible in the
    // same discovery inbox when the discovery migration has been applied.
    const discoveryTable=(await client.query("SELECT to_regclass('discovery_candidates') AS name")).rows[0]?.name;
    if(discoveryTable) {
      const candidateId=`discovery-${createHash('sha256').update(parsed.canonicalUrl).digest('hex').slice(0,32)}`;
      const observation={adapter:'manual_social_intake',registryId:'social-intake',sourceName:'Social Intake manual',submissionSource,limitation:'Operator-submitted supplementary signal; no automated social scraping or engagement metrics.'};
      const existing=(await client.query(`SELECT provenance FROM discovery_candidates WHERE canonical_url=$1 FOR UPDATE`,[parsed.canonicalUrl])).rows[0];
      if(existing) await client.query(`UPDATE discovery_candidates SET last_seen_at=now(),updated_at=now(),provenance=$2 WHERE canonical_url=$1`,[parsed.canonicalUrl,JSON.stringify(mergeObservationEnvelope(existing.provenance,observation))]);
      else await client.query(`INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,summary,observed_at,provenance)
        VALUES($1,'social-intake','social_intake','Social Intake manual',$2,$3,$4,$5,now(),$6)`,
        [candidateId,parsed.originalUrl,parsed.canonicalUrl,claimDescription,investigationReason,JSON.stringify(mergeObservationEnvelope({},observation))]);
    }
    await client.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value)
      VALUES($1,'social_intake',$2,$3,'operator',$4,$5)`,[randomUUID(),itemId,duplicate?'social_intake_duplicate_submitted':'social_intake_submitted',duplicate?'Același link social a fost trimis din nou; proveniența a fost păstrată.':'Link social adăugat din admin.',JSON.stringify({platform:parsed.platform,originalUrl:parsed.originalUrl,submissionSource})]);
    await client.query('COMMIT');
    return {id:itemId,duplicate,platform:parsed.platform};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

export async function listSocialIntake(pool: pg.Pool, selectedPlatform: string, selectedStatus: string, page=1) {
  const platformFilter=selectedPlatform ? platform(selectedPlatform) : '';
  const statusFilter=selectedStatus ? status(selectedStatus) : '';
  const safePage=Math.max(1,Math.min(10000,Math.floor(page)||1));
  const where='($1::text=\'\' OR platform=$1) AND ($2::text=\'\' OR editorial_status=$2)';
  const total=(await pool.query(`SELECT count(*)::int AS n FROM social_intake_items WHERE ${where}`,[platformFilter,statusFilter])).rows[0].n;
  const rows=(await pool.query(`SELECT * FROM social_intake_items WHERE ${where} ORDER BY submitted_at DESC,id LIMIT 30 OFFSET $3`,[platformFilter,statusFilter,(safePage-1)*30])).rows;
  return {rows,total,page:safePage};
}

export async function getSocialIntake(pool: pg.Pool, id: string) {
  const item=(await pool.query('SELECT * FROM social_intake_items WHERE id=$1',[id])).rows[0];
  if(!item) return null;
  const provenance=(await pool.query('SELECT * FROM social_intake_provenance WHERE intake_id=$1 ORDER BY submitted_at DESC,id DESC',[id])).rows;
  return {item,provenance};
}

export async function setSocialStatus(pool: pg.Pool, id: string, nextStatus: string) {
  const next=status(nextStatus);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const before=(await client.query('SELECT editorial_status FROM social_intake_items WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!before) validation('Semnalul social nu există.');
    if(before.editorial_status!==next){
      await client.query('UPDATE social_intake_items SET editorial_status=$2,updated_at=now() WHERE id=$1',[id,next]);
      await client.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,before_value,after_value)
        VALUES($1,'social_intake',$2,'social_intake_status_changed','operator','Stare editorială modificată din admin.',$3,$4)`,[randomUUID(),id,JSON.stringify({editorialStatus:before.editorial_status}),JSON.stringify({editorialStatus:next})]);
    }
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

export async function updateSocialEnrichment(pool: pg.Pool, id: string, input: SocialEnrichment) {
  const claimDescription=requiredText(input.claimDescription,'Descrierea afirmației',1000);
  const investigationReason=requiredText(input.investigationReason,'Motivul investigației',1000);
  const metadata: Record<string,string> = {};
  const fields: Array<[keyof SocialEnrichment,string,number,string | undefined]> = [['title','Titlul confirmat',500,input.title],['author','Autorul confirmat',200,input.author],['publishedAt','Data publicării',30,input.publishedAt],['notes','Note despre metadata',1000,input.notes]];
  for(const [key,label,max,value] of fields){
    const clean=optionalText(value,label,max);
    if(key==='publishedAt' && clean && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) validation('Data publicării trebuie să folosească formatul AAAA-LL-ZZ.');
    if(clean) metadata[key]=clean;
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE social_intake_items SET claim_description=$2,investigation_reason=$3,metadata=$4,metadata_status=$5,updated_at=now()
      WHERE id=$1 RETURNING id`,[id,claimDescription,investigationReason,JSON.stringify(metadata),Object.keys(metadata).length?'manually_confirmed':'not_retrieved']);
    if(!result.rowCount) validation('Semnalul social nu există.');
    await client.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value)
      VALUES($1,'social_intake',$2,'social_intake_enriched','operator','Descrierea și/sau metadata au fost completate manual din admin.',$3)`,[randomUUID(),id,JSON.stringify({claimDescription,investigationReason,metadata})]);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

export async function dashboard(pool: pg.Pool) {
  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM sources WHERE platform='rss') AS sources,
    (SELECT count(*)::int FROM sources WHERE platform='rss' AND enabled) AS enabled,
    (SELECT count(*)::int FROM source_items) AS articles,
    (SELECT count(*)::int FROM source_items WHERE metadata->'photo' IS NOT NULL AND metadata->'photo'<>'null'::jsonb) AS photos`)).rows[0];
  const discoveryAvailable=Boolean((await pool.query("SELECT to_regclass('discovery_candidates') AS name")).rows[0]?.name);
  if(discoveryAvailable) {
    const discoveryCounts=(await pool.query(`SELECT count(*)::int AS discoveries,
      count(*) FILTER (WHERE observed_at >= now()-interval '24 hours')::int AS discoveries_last_24h,
      count(*) FILTER (WHERE status IN ('new','queued','reviewing'))::int AS open_discoveries,
      (SELECT count(*)::int FROM discovery_source_registry) AS discovery_sources,
      (SELECT count(*)::int FROM (
        SELECT g.id
        FROM discovery_groups g
        JOIN discovery_group_members gm ON gm.group_id=g.id
        JOIN discovery_candidates c ON c.id=gm.candidate_id
        GROUP BY g.id
        HAVING count(DISTINCT c.id)>1 AND count(DISTINCT c.source_id)>1
      ) eligible_groups) AS multi_source_groups
      FROM discovery_candidates`)).rows[0];
    Object.assign(counts,discoveryCounts);
  } else Object.assign(counts,{discoveries:0,discoveries_last_24h:0,open_discoveries:0,discovery_sources:0,multi_source_groups:0});
  const editions = (await pool.query(`SELECT id,edition_date,status,page_count FROM editions WHERE mode='live' ORDER BY edition_date DESC,revision DESC LIMIT 5`)).rows;
  const lastRun=discoveryAvailable ? (await pool.query(`SELECT id,started_at,finished_at,status,candidates_seen,candidates_added,groups_updated,adapter_results FROM discovery_runs ORDER BY started_at DESC LIMIT 1`)).rows[0] ?? null : null;
  return {counts,editions,lastRun};
}
export async function listSources(pool: pg.Pool) {
  return (await pool.query(`SELECT s.*,count(i.id)::int AS item_count FROM sources s LEFT JOIN source_items i ON i.source_id=s.id WHERE s.platform='rss' GROUP BY s.id ORDER BY s.name`)).rows;
}
export async function listArticles(pool: pg.Pool, source: string, page: number) {
  const where = `($1::text='' OR i.source_id=$1)`;
  const total = (await pool.query(`SELECT count(*)::int AS n FROM source_items i WHERE ${where}`,[source])).rows[0].n;
  const rows = (await pool.query(`SELECT i.*,s.name AS source_name FROM source_items i JOIN sources s ON s.id=i.source_id WHERE ${where} ORDER BY i.fetched_at DESC,i.id LIMIT 30 OFFSET $2`,[source,(page-1)*30])).rows;
  return {rows,total};
}
export async function addSource(pool: pg.Pool, name: string, input: string) {
  const url = feedURL(input).href;
  if(name.length<2 || name.length>100) throw new Error('Numele trebuie să aibă între 2 și 100 de caractere.');
  const id = `rss-${createHash('sha256').update(url).digest('hex').slice(0,32)}`;
  const result = await pool.query(`WITH added AS (
    INSERT INTO sources(id,platform,name,config,enabled) VALUES($1,'rss',$2,$3,true)
    ON CONFLICT(id) DO NOTHING RETURNING id
  ) INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason)
    SELECT $4,'source',id,'source_added','operator','Sursă RSS adăugată din admin' FROM added RETURNING entity_id`,[id,name,JSON.stringify({url}),randomUUID()]);
  return Boolean(result.rowCount);
}
export async function setSourceEnabled(pool: pg.Pool, id: string, enabled: boolean) {
  const result = await pool.query(`WITH changed AS (
    UPDATE sources SET enabled=$2 WHERE id=$1 AND platform='rss' RETURNING id
  ) INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason)
    SELECT $3,'source',id,$4,'operator','Stare modificată din admin' FROM changed RETURNING entity_id`,[id,enabled,randomUUID(),enabled?'source_enabled':'source_disabled']);
  if(!result.rowCount) throw new Error('Sursa nu există.');
}

export const discoveryStatuses = ['new','queued','reviewing','dismissed','grouped'] as const;
export type DiscoveryStatus = typeof discoveryStatuses[number];
export const discoveryKinds = ['rss','google_trends','youtube_api','social_intake'] as const;
export type DiscoveryKind = typeof discoveryKinds[number];

function discoveryStatus(value: string): DiscoveryStatus {
  if(!discoveryStatuses.includes(value as DiscoveryStatus)) throw new Error('Starea descoperirii nu este validă.');
  return value as DiscoveryStatus;
}

function discoveryKind(value: string): DiscoveryKind {
  if(!discoveryKinds.includes(value as DiscoveryKind)) throw new Error('Tipul descoperirii nu este valid.');
  return value as DiscoveryKind;
}

function candidateSourceNames(candidate: any) {
  const observations=Array.isArray(candidate.provenance?.observations) ? candidate.provenance.observations : candidate.provenance ? [candidate.provenance] : [];
  return [...new Set([candidate.source_name,...observations.map((observation:any)=>observation?.sourceName)].filter(Boolean))];
}

export async function listDiscoveries(pool: pg.Pool, kind: string, statusValue: string, page=1, sort='diversified') {
  const selectedKind=kind ? discoveryKind(kind) : '';
  const selectedStatus=statusValue ? discoveryStatus(statusValue) : '';
  const safePage=Math.max(1,Math.min(10000,Math.floor(page)||1));
  const groups=(await pool.query(`SELECT g.id,g.title,g.method,g.provisional,
      min(c.observed_at) AS first_seen,max(c.observed_at) AS last_seen,
      count(DISTINCT c.id)::int AS candidate_count,count(DISTINCT c.source_id)::int AS source_count,
      count(DISTINCT c.id) FILTER (WHERE ($1::text='' OR c.source_kind=$1) AND ($2::text='' OR c.status=$2))::int AS matching_candidate_count,
      count(DISTINCT c.source_id) FILTER (WHERE ($1::text='' OR c.source_kind=$1) AND ($2::text='' OR c.status=$2))::int AS matching_source_count,
      array_agg(DISTINCT c.source_name ORDER BY c.source_name) AS source_names,
      jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'source_id',c.source_id,'source_name',c.source_name,
        'source_kind',c.source_kind,'original_url',c.original_url,'canonical_url',c.canonical_url,
        'summary',c.summary,'observed_at',c.observed_at,'published_at',c.published_at,
        'provenance',c.provenance,'popularity_signals',c.popularity_signals,'status',c.status,
        'editorial_interest',c.editorial_interest,'verification_priority',c.verification_priority,
        'matches_filter',(($1::text='' OR c.source_kind=$1) AND ($2::text='' OR c.status=$2)))
        ORDER BY c.observed_at DESC,c.id) AS members
    FROM discovery_groups g
    JOIN discovery_group_members gm ON gm.group_id=g.id
    JOIN discovery_candidates c ON c.id=gm.candidate_id
    GROUP BY g.id
    HAVING count(DISTINCT c.id)>1 AND count(DISTINCT c.source_id)>1
      AND ($1::text='' OR bool_or(c.source_kind=$1))
      AND ($2::text='' OR bool_or(c.status=$2))`,[selectedKind,selectedStatus])).rows;
  const candidates=(await pool.query(`SELECT c.* FROM discovery_candidates c
    WHERE ($1::text='' OR c.source_kind=$1) AND ($2::text='' OR c.status=$2)
    ORDER BY c.observed_at DESC,c.id`,[selectedKind,selectedStatus])).rows;
  const groupedCandidateIds=new Set(groups.flatMap(group => (group.members as any[]).map(member => member.id)));
  const groupItems=groups.map(group => ({...group,item_type:'group',id:group.id,title:group.title,observed_at:group.last_seen,
    source_names:group.source_names ?? [],source_count:Number(group.source_count),candidate_count:Number(group.candidate_count),
    matching_candidate_count:Number(group.matching_candidate_count),matching_source_count:Number(group.matching_source_count),
    contextual_candidate_count:Number(group.candidate_count)-Number(group.matching_candidate_count),members:group.members ?? []}));
  const candidateItems=candidates.filter(candidate => !groupedCandidateIds.has(candidate.id)).map(candidate => {
    const sourceNames=candidateSourceNames(candidate);
    return {...candidate,item_type:'candidate',source_names:sourceNames,source_count:sourceNames.length,candidate_count:1,members:[candidate]};
  });
  const items=[...groupItems,...candidateItems];
  const byRecent=(left:any,right:any)=>Date.parse(String(right.observed_at))-Date.parse(String(left.observed_at)) || String(left.id).localeCompare(String(right.id));
  items.sort(byRecent);
  if(sort!=='recent') {
    const queues=new Map<string,any[]>();
    for(const item of items) {
      const key=String((item.source_names?.[0] ?? item.source_name ?? 'Sursă nespecificată'));
      const queue=queues.get(key) ?? []; queue.push(item); queues.set(key,queue);
    }
    const sourceKeys=[...queues.keys()].sort((left,right)=>left.localeCompare(right));
    const diversified:any[]=[];
    let remaining=items.length;
    while(remaining) {
      for(const sourceKey of sourceKeys) {
        const item=queues.get(sourceKey)?.shift();
        if(item){diversified.push(item);remaining--;}
      }
    }
    items.splice(0,items.length,...diversified);
  }
  return {rows:items.slice((safePage-1)*30,safePage*30),total:items.length,group_total:groupItems.length,page:safePage,sort:sort==='recent'?'recent':'diversified'};
}

export async function getDiscovery(pool: pg.Pool, id: string) {
  const candidate=(await pool.query(`SELECT c.*,g.id AS group_id,g.title AS group_title,g.method AS group_method
    FROM discovery_candidates c LEFT JOIN discovery_group_members gm ON gm.candidate_id=c.id LEFT JOIN discovery_groups g ON g.id=gm.group_id WHERE c.id=$1`,[id])).rows[0];
  if(!candidate) return null;
  const run=(await pool.query(`SELECT started_at,status,adapter_results FROM discovery_runs WHERE adapter_results::text LIKE $1 ORDER BY started_at DESC LIMIT 1`,[`%${candidate.source_kind}%`])).rows[0] ?? null;
  return {candidate,run};
}

export async function setDiscoveryStatus(pool: pg.Pool, id: string, nextStatus: string) {
  const next=discoveryStatus(nextStatus);
  const result=await pool.query(`WITH changed AS (UPDATE discovery_candidates SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status)
    INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value)
    SELECT $3,'discovery_candidate',id,'discovery_status_changed','operator','Stare de lucru modificată din admin.',jsonb_build_object('status',status) FROM changed RETURNING entity_id`,[id,next,randomUUID()]);
  if(!result.rowCount) throw new Error('Descoperirea nu există.');
}

export async function discoverySources(pool: pg.Pool) {
  return (await pool.query(`SELECT id,kind,name,endpoint_url,verification_url,viewpoint,region,enabled,verified_at FROM discovery_source_registry ORDER BY kind,name`)).rows;
}

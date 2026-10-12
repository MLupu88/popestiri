import type pg from 'pg';
import {createHash} from 'node:crypto';
import {configuredClaimExtractor, claimGroupingKey} from './extractor.ts';
import {claimExtractionSchema, type ClaimExtractionInput, type ClaimLeadSpread, type ClaimExtractionProvider, type ClaimExtraction} from './types.ts';

type CandidateRow = {
  id:string; source_id:string; source_kind:string; source_name:string; original_url:string; title:string;
  summary:string|null; observed_at:string; published_at:string|null; created_at:string; updated_at:string; provenance:any; popularity_signals:any; manual_platform?:string|null;
};

const jsonObject=(value:unknown):Record<string,any> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,any> : {};
const observations=(value:unknown):Record<string,any>[] => {const object=jsonObject(value);return Array.isArray(object.observations) ? object.observations.filter(item=>item&&typeof item==='object') : Object.keys(object).length ? [object] : [];};
const text=(value:unknown, limit=500) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit) : null;
const integerText=(value:unknown) => typeof value==='string' && /^\d+$/.test(value) ? value : typeof value==='number' && Number.isSafeInteger(value) && value>=0 ? String(value) : null;
const leadId=(key:string) => `claim-lead-${createHash('sha256').update(key).digest('hex').slice(0,32)}`;
const referenceId=(lead:string,candidate:string,source:string) => `claim-ref-${createHash('sha256').update(`${lead}|${candidate}|${source}`).digest('hex').slice(0,32)}`;
const observationId=(lead:string,candidate:string,at:string,source:string) => `claim-observation-${createHash('sha256').update(`${lead}|${candidate}|${at}|${source}`).digest('hex').slice(0,32)}`;
const stableJSON=(value:unknown):string => {
  if(value===null || typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  return `{${Object.keys(value as object).sort().map(key=>`${JSON.stringify(key)}:${stableJSON((value as Record<string,unknown>)[key])}`).join(',')}}`;
};
const fingerprint=(value:unknown) => createHash('sha256').update(stableJSON(value)).digest('hex');

function platform(candidate: CandidateRow) {
  if(candidate.source_kind==='youtube_api') return 'youtube';
  if(candidate.source_kind==='google_trends') return 'google_trends';
  if(candidate.source_kind==='social_intake') {
    if(['facebook','tiktok','youtube'].includes(String(candidate.manual_platform))) return String(candidate.manual_platform);
    const source=sourceObservations(candidate).find(value=>['facebook','tiktok','youtube'].includes(String(value.platform)));
    return text(source?.platform,50) ?? 'social';
  }
  return 'rss';
}

function sourceObservations(candidate: CandidateRow) {
  const values=observations(candidate.provenance);
  return values.length ? values : [{registryId:candidate.source_id,sourceName:candidate.source_name,adapter:candidate.source_kind}];
}

function extractionInput(candidate: CandidateRow): ClaimExtractionInput {
  return {candidateId:candidate.id,originalUrl:candidate.original_url,title:candidate.title,summary:candidate.summary,sourceKind:candidate.source_kind,sourceName:candidate.source_name,platform:platform(candidate)};
}

function metricObservations(candidate: CandidateRow) {
  if(candidate.source_kind!=='youtube_api') return [{observedAt:candidate.observed_at,metrics:{},availabilityStatus:'not_applicable' as const,viewCount:null,commentCount:null,limitation:'Nu există o metrică de reach publică furnizată pentru acest canal; numărul de referințe nu este convertit în viralitate.',capturedBy:candidate.source_kind}];
  const values=observations(candidate.popularity_signals);
  if(!values.length) return [{observedAt:candidate.observed_at,metrics:{},availabilityStatus:'not_available' as const,viewCount:null,commentCount:null,limitation:'YouTube nu a furnizat metrici publice pentru această observație.',capturedBy:'youtube_data_api'}];
  return values.map(value=>{
    const views=integerText(value.viewCount), comments=integerText(value.commentCount);
    const observedAt=text(value.capturedAt,100) ?? candidate.observed_at;
    const metricSource=text(value.capturedBy,100) ?? 'youtube_data_api';
    return {observedAt,metrics:{...value,...(views ? {viewCount:views} : {}),...(comments ? {commentCount:comments} : {})},availabilityStatus:views || comments ? 'observed' as const : 'not_available' as const,viewCount:views,commentCount:comments,limitation:views || comments ? 'Metrici publice observate prin YouTube Data API; nu sunt verdict și nu sunt comparabile între contexte diferite fără aceeași sursă și metrică.' : 'YouTube nu a furnizat viewCount/commentCount pentru această observație.',capturedBy:metricSource};
  });
}

function publisher(source:any, candidate:CandidateRow) {
  return {publisherName:text(source.publisherName ?? source.channelTitle ?? source.sourceName ?? candidate.source_name,300),publisherId:text(source.publisherId ?? source.channelId,200),channelTitle:text(source.channelTitle,300),channelId:text(source.channelId,200)};
}

export async function persistClaimLead(pool:pg.Pool,candidate:CandidateRow,provider:ClaimExtractionProvider=configuredClaimExtractor(),providedExtraction?:ClaimExtraction) {
  const extraction=providedExtraction ?? await provider.extract(extractionInput(candidate));
  const groupingKey=claimGroupingKey(extractionInput(candidate),extraction);
  const id=leadId(groupingKey);
  const sourceValues=sourceObservations(candidate);
  const primary=publisher(sourceValues[0],candidate);
  const surfacedReason=extraction.classification==='testable_claim' ? 'Afirmație verificabilă extrasă din conținut public, cu referința originală păstrată.' : extraction.classification==='generic_broadcast' ? 'Buletin generic păstrat pentru trasabilitate; nu este tratat ca afirmație distinctă fără aserțiune identificabilă.' : extraction.classification==='entertainment' ? 'Conținutul este păstrat ca semnal, dar nu este prioritizat drept afirmație de interes public.' : 'Semnal păstrat deoarece conținutul nu permite încă o afirmație verificabilă sigură.';
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO claim_leads(id,assertion_text,exact_text,machine_paraphrase,classification,extraction_method,extraction_model,extraction_version,extraction_limitations,extraction_evidence,grouping_key,platform,discovery_method,publisher_name,publisher_id,channel_title,channel_id,surfaced_reason,first_observed_at,last_observed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
      ON CONFLICT(grouping_key) DO UPDATE SET
        assertion_text=COALESCE(claim_leads.assertion_text,EXCLUDED.assertion_text), exact_text=COALESCE(claim_leads.exact_text,EXCLUDED.exact_text), machine_paraphrase=COALESCE(claim_leads.machine_paraphrase,EXCLUDED.machine_paraphrase),
        extraction_method=EXCLUDED.extraction_method, extraction_model=EXCLUDED.extraction_model, extraction_version=EXCLUDED.extraction_version, extraction_limitations=EXCLUDED.extraction_limitations, extraction_evidence=EXCLUDED.extraction_evidence,
        publisher_name=COALESCE(claim_leads.publisher_name,EXCLUDED.publisher_name),publisher_id=COALESCE(claim_leads.publisher_id,EXCLUDED.publisher_id),channel_title=COALESCE(claim_leads.channel_title,EXCLUDED.channel_title),channel_id=COALESCE(claim_leads.channel_id,EXCLUDED.channel_id),last_observed_at=GREATEST(claim_leads.last_observed_at,EXCLUDED.last_observed_at),updated_at=now()
      RETURNING id`,[id,extraction.assertionText,extraction.exactText,extraction.machineParaphrase,extraction.classification,extraction.extractionMethod,extraction.extractionModel,extraction.extractionVersion,extraction.limitations,JSON.stringify(extraction.evidence),groupingKey,platform(candidate),candidate.source_kind,primary.publisherName,primary.publisherId,primary.channelTitle,primary.channelId,surfacedReason,candidate.observed_at]);
    for(const source of sourceValues) {
      const identity=publisher(source,candidate);
      const sourceId=text(source.registryId ?? source.sourceId ?? candidate.source_id,200) ?? candidate.source_id;
      await client.query(`INSERT INTO claim_lead_references(id,claim_lead_id,candidate_id,source_id,original_url,platform,discovery_method,publisher_name,publisher_id,channel_title,channel_id,published_at,observed_at,extraction_evidence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(claim_lead_id,candidate_id,source_id) DO NOTHING`,[referenceId(id,candidate.id,sourceId),id,candidate.id,sourceId,candidate.original_url,platform(candidate),candidate.source_kind,identity.publisherName,identity.publisherId,identity.channelTitle,identity.channelId,candidate.published_at,candidate.observed_at,JSON.stringify(extraction.evidence)]);
    }
    for(const metric of metricObservations(candidate)) {
      await client.query(`INSERT INTO claim_observations(id,claim_lead_id,candidate_id,observed_at,metric_source,availability_status,view_count,comment_count,metrics,limitation,captured_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(claim_lead_id,candidate_id,observed_at,metric_source) DO NOTHING`,[observationId(id,candidate.id,metric.observedAt,metric.capturedBy),id,candidate.id,metric.observedAt,metric.capturedBy,metric.availabilityStatus,metric.viewCount ?? null,metric.commentCount ?? null,JSON.stringify(metric.metrics),metric.limitation,metric.capturedBy]);
    }
    await client.query(`INSERT INTO claim_radar_candidate_state(candidate_id,claim_lead_id,content_fingerprint,metric_fingerprint,extraction,last_candidate_updated_at,processing_status,last_error)
      VALUES($1,$2,$3,$4,$5,$6,'processed',NULL)
      ON CONFLICT(candidate_id) DO UPDATE SET claim_lead_id=EXCLUDED.claim_lead_id,content_fingerprint=EXCLUDED.content_fingerprint,metric_fingerprint=EXCLUDED.metric_fingerprint,extraction=EXCLUDED.extraction,last_candidate_updated_at=EXCLUDED.last_candidate_updated_at,last_processed_at=now(),processing_status='processed',last_error=NULL`,[candidate.id,id,fingerprint({originalUrl:candidate.original_url,title:candidate.title,summary:candidate.summary,sourceKind:candidate.source_kind,sourceId:candidate.source_id}),fingerprint(candidate.popularity_signals),JSON.stringify(extraction),candidate.updated_at]);
    await client.query('COMMIT');
    return {id,classification:extraction.classification,created:groupingKey===`candidate|${candidate.id}`};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

type ClaimRadarOptions = {provider?:ClaimExtractionProvider;candidateIds?:string[];mode?:'incremental'|'backfill';batchSize?:number};

function batchSize(value:unknown) {
  return typeof value==='number' && Number.isSafeInteger(value) && value>0 && value<=1000 ? value : 250;
}

async function markUnchanged(pool:pg.Pool,candidate:CandidateRow) {
  await pool.query(`UPDATE claim_radar_candidate_state SET last_candidate_updated_at=$2,last_processed_at=now(),processing_status='processed',last_error=NULL WHERE candidate_id=$1`,[candidate.id,candidate.updated_at]);
}

export async function runClaimRadar(pool:pg.Pool,options:ClaimRadarOptions = {}) {
  const args=options.candidateIds ?? [];
  const limit=batchSize(options.batchSize);
  const stateJoin=`LEFT JOIN claim_radar_candidate_state s ON s.candidate_id=c.id`;
  const changed=`(s.candidate_id IS NULL OR c.updated_at>s.last_candidate_updated_at)`;
  const rows=(await pool.query(`SELECT c.id,c.source_id,c.source_kind,c.source_name,c.original_url,c.title,c.summary,c.observed_at,c.published_at,c.created_at,c.updated_at,c.provenance,c.popularity_signals,si.platform AS manual_platform,
      s.content_fingerprint AS state_content_fingerprint,s.metric_fingerprint AS state_metric_fingerprint,s.extraction AS state_extraction
      FROM discovery_candidates c LEFT JOIN social_intake_items si ON si.canonical_url=c.canonical_url ${stateJoin}
      WHERE ${args.length ? 'c.id=ANY($1::text[]) AND ' : ''}${changed}
      ORDER BY c.updated_at ASC,c.id LIMIT ${args.length ? '$2' : '$1'}`,args.length ? [args,limit] : [limit])).rows as Array<CandidateRow & {state_content_fingerprint:string|null;state_metric_fingerprint:string|null;state_extraction:unknown}>;
  const provider=options.provider ?? configuredClaimExtractor();
  let leads=0,failed=0;
  for(const candidate of rows) {
    try {
      const contentFingerprint=fingerprint({originalUrl:candidate.original_url,title:candidate.title,summary:candidate.summary,sourceKind:candidate.source_kind,sourceId:candidate.source_id});
      const metricFingerprint=fingerprint(candidate.popularity_signals);
      const unchanged=candidate.state_content_fingerprint===contentFingerprint && candidate.state_metric_fingerprint===metricFingerprint;
      if(unchanged) {await markUnchanged(pool,candidate);continue;}
      let extraction:ClaimExtraction|undefined;
      if(candidate.state_content_fingerprint===contentFingerprint && candidate.state_extraction) extraction=claimExtractionSchema.parse(candidate.state_extraction);
      await persistClaimLead(pool,candidate,provider,extraction);
      leads++;
    } catch {failed++;}
  }
  const complete=rows.length===0;
  await pool.query(`UPDATE claim_radar_checkpoint SET historical_backfill_complete=CASE WHEN $1::boolean THEN true ELSE historical_backfill_complete END,last_run_at=now(),updated_at=now() WHERE id='default'`,[complete && (options.mode??'incremental')==='backfill']);
  return {candidates:rows.length,leads,failed,method:provider.method,complete,mode:options.mode??'incremental'};
}

/** Run the bounded, repeatable one-time migration of pre-radar candidates. */
export async function runClaimRadarBackfill(pool:pg.Pool,options:Omit<ClaimRadarOptions,'mode'> = {}) {
  return runClaimRadar(pool,{...options,mode:'backfill'});
}

function delta(first:string|null,latest:string|null) {
  if(first===null || latest===null) return null;
  try {return (BigInt(latest)-BigInt(first)).toString();} catch {return null;}
}

export function calculateObservedSpread(rows:Array<{candidate_id:string;metric_source:string;observed_at:string;view_count:string|number|null;comment_count:string|number|null}>):ClaimLeadSpread {
  const series=new Map<string,typeof rows>();
  for(const row of rows) {if(row.view_count===null && row.comment_count===null) continue;const key=`${row.candidate_id}|${row.metric_source}`;const values=series.get(key) ?? [];values.push(row);series.set(key,values);}
  const toValue=(value:string|number|null)=>value===null ? null : String(value);
  const observations=[...series.values()].reduce((total,values)=>total+values.length,0);
  const comparisons=[...series.entries()].flatMap(([key,values])=>{
    values.sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
    if(values.length<2) return [];
    const first=values[0],latest=values[values.length-1];
    const viewValues=values.filter(value=>value.view_count!==null),commentValues=values.filter(value=>value.comment_count!==null);
    const firstView=viewValues[0],latestView=viewValues[viewValues.length-1];
    const firstComment=commentValues[0],latestComment=commentValues[commentValues.length-1];
    return [{candidateId:key.slice(0,key.indexOf('|')),metricSource:key.slice(key.indexOf('|')+1),first:{observedAt:first.observed_at,viewCount:toValue(first.view_count),commentCount:toValue(first.comment_count)},latest:{observedAt:latest.observed_at,viewCount:toValue(latest.view_count),commentCount:toValue(latest.comment_count)},viewChange:viewValues.length>=2 ? delta(toValue(firstView?.view_count ?? null),toValue(latestView?.view_count ?? null)) : null,commentChange:commentValues.length>=2 ? delta(toValue(firstComment?.comment_count ?? null),toValue(latestComment?.comment_count ?? null)) : null}];
  });
  if(!observations) return {status:'not_available',observations:0,comparisons:[],limitation:'Nu există metrici publice comparabile disponibile.'};
  if(!comparisons.length) return {status:'insufficient_history',observations,comparisons:[],limitation:'Nu există două măsurători ale aceluiași video/candidat și metric source; creșterea claim-level nu poate fi calculată.'};
  const single=comparisons.length===1 ? comparisons[0] : undefined;
  return {status:'observed',observations,comparisons,first:single?.first,latest:single?.latest,viewChange:single?.viewChange ?? null,commentChange:single?.commentChange ?? null,limitation:comparisons.length>1 ? 'Schimbările sunt afișate separat pentru fiecare video/candidat; nu se agregă între referințe.' : 'Schimbarea este observată între măsurători ale aceluiași video/candidat și metric source; nu este o rată virală și nu reprezintă importanță sau adevăr.'};
}

export async function listClaimLeads(pool:pg.Pool,classification='',status='',page=1) {
  const safePage=Math.max(1,Math.min(10000,Math.floor(page)||1));
  const params=[classification,status];
  const leads=(await pool.query(`SELECT l.*,count(DISTINCT r.id)::int AS reference_count,count(DISTINCT r.source_id)::int AS source_count,count(DISTINCT r.platform)::int AS platform_count,count(DISTINCT COALESCE(NULLIF(r.publisher_id,''),NULLIF(r.publisher_name,'')))::int AS account_count,
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('url',r.original_url,'publisher',r.publisher_name,'channelTitle',r.channel_title,'platform',r.platform,'publishedAt',r.published_at,'observedAt',r.observed_at)) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) AS references
    FROM claim_leads l LEFT JOIN claim_lead_references r ON r.claim_lead_id=l.id
    WHERE ($1::text='' OR l.classification=$1) AND ($2::text='' OR l.editorial_status=$2)
    GROUP BY l.id ORDER BY l.last_observed_at DESC,l.id LIMIT 30 OFFSET $3`,[...params,(safePage-1)*30])).rows;
  const count=(await pool.query(`SELECT count(*)::int AS n FROM claim_leads WHERE ($1::text='' OR classification=$1) AND ($2::text='' OR editorial_status=$2)`,params)).rows[0].n;
  for(const lead of leads) {
    const observations=(await pool.query(`SELECT candidate_id,metric_source,observed_at,view_count,comment_count FROM claim_observations WHERE claim_lead_id=$1 ORDER BY observed_at ASC`,[lead.id])).rows;
    lead.spread=calculateObservedSpread(observations);
  }
  return {rows:leads,total:count,page:safePage};
}

export async function setClaimLeadStatus(pool:pg.Pool,id:string,status:string) {
  if(!['new','reviewing','investigating','closed','dismissed'].includes(status)) throw new Error('Starea afirmației nu este validă.');
  const result=await pool.query(`UPDATE claim_leads SET editorial_status=$2,updated_at=now() WHERE id=$1 RETURNING id`,[id,status]);
  if(!result.rowCount) throw new Error('Afirmația nu există.');
}

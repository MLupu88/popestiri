import type pg from 'pg';
import {createHash} from 'node:crypto';
import {configuredClaimExtractor, claimGroupingKey} from './extractor.ts';
import type {ClaimExtractionInput, ClaimLeadSpread, ClaimExtractionProvider} from './types.ts';

type CandidateRow = {
  id:string; source_id:string; source_kind:string; source_name:string; original_url:string; title:string;
  summary:string|null; observed_at:string; published_at:string|null; provenance:any; popularity_signals:any;
};

const jsonObject=(value:unknown):Record<string,any> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,any> : {};
const observations=(value:unknown):Record<string,any>[] => {const object=jsonObject(value);return Array.isArray(object.observations) ? object.observations.filter(item=>item&&typeof item==='object') : Object.keys(object).length ? [object] : [];};
const text=(value:unknown, limit=500) => typeof value==='string' ? value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit) : null;
const integerText=(value:unknown) => typeof value==='string' && /^\d+$/.test(value) ? value : typeof value==='number' && Number.isSafeInteger(value) && value>=0 ? String(value) : null;
const leadId=(key:string) => `claim-lead-${createHash('sha256').update(key).digest('hex').slice(0,32)}`;
const referenceId=(lead:string,candidate:string,source:string) => `claim-ref-${createHash('sha256').update(`${lead}|${candidate}|${source}`).digest('hex').slice(0,32)}`;
const observationId=(lead:string,candidate:string,at:string,source:string) => `claim-observation-${createHash('sha256').update(`${lead}|${candidate}|${at}|${source}`).digest('hex').slice(0,32)}`;

function platform(candidate: CandidateRow) {
  if(candidate.source_kind==='youtube_api') return 'youtube';
  if(candidate.source_kind==='google_trends') return 'google_trends';
  if(candidate.source_kind==='social_intake') return text(candidate.provenance?.platform,50) ?? 'social';
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
    return {observedAt,metrics:{...value,...(views ? {viewCount:views} : {}),...(comments ? {commentCount:comments} : {})},availabilityStatus:views || comments ? 'observed' as const : 'not_available' as const,viewCount:views,commentCount:comments,limitation:views || comments ? 'Metrici publice observate prin YouTube Data API; nu sunt verdict și nu sunt comparabile între contexte diferite fără aceeași sursă și metrică.' : 'YouTube nu a furnizat viewCount/commentCount pentru această observație.',capturedBy:'youtube_data_api'};
  });
}

function publisher(source:any, candidate:CandidateRow) {
  return {publisherName:text(source.publisherName ?? source.channelTitle ?? source.sourceName ?? candidate.source_name,300),publisherId:text(source.publisherId ?? source.channelId,200),channelTitle:text(source.channelTitle,300),channelId:text(source.channelId,200)};
}

export async function persistClaimLead(pool:pg.Pool,candidate:CandidateRow,provider:ClaimExtractionProvider=configuredClaimExtractor()) {
  const extraction=await provider.extract(extractionInput(candidate));
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
    await client.query('COMMIT');
    return {id,classification:extraction.classification,created:groupingKey===`candidate|${candidate.id}`};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}

export async function runClaimRadar(pool:pg.Pool,options:{provider?:ClaimExtractionProvider;candidateIds?:string[]} = {}) {
  const args=options.candidateIds ?? [];
  const rows=(await pool.query(`SELECT id,source_id,source_kind,source_name,original_url,title,summary,observed_at,published_at,provenance,popularity_signals FROM discovery_candidates ${args.length ? 'WHERE id=ANY($1::text[])' : ''} ORDER BY observed_at ASC,id LIMIT 1000`,args.length ? [args] : undefined)).rows as CandidateRow[];
  const provider=options.provider ?? configuredClaimExtractor();
  let leads=0,failed=0;
  for(const candidate of rows) {try {await persistClaimLead(pool,candidate,provider);leads++;} catch {failed++;}}
  return {candidates:rows.length,leads,failed,method:provider.method};
}

function delta(first:string|null,latest:string|null) {
  if(first===null || latest===null) return null;
  try {return (BigInt(latest)-BigInt(first)).toString();} catch {return null;}
}

export function calculateObservedSpread(rows:Array<{observed_at:string;view_count:string|number|null;comment_count:string|number|null}>):ClaimLeadSpread {
  const comparable=rows.filter(row=>row.view_count!==null || row.comment_count!==null).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
  const toValue=(value:string|number|null)=>value===null ? null : String(value);
  if(!comparable.length) return {status:'not_available',observations:0,limitation:'Nu există metrici publice comparabile disponibile.'};
  const first=comparable[0],latest=comparable[comparable.length-1];
  if(comparable.length<2) return {status:'insufficient_history',observations:1,first:{observedAt:first.observed_at,viewCount:toValue(first.view_count),commentCount:toValue(first.comment_count)},latest:{observedAt:latest.observed_at,viewCount:toValue(latest.view_count),commentCount:toValue(latest.comment_count)},limitation:'Există o singură observație; creșterea nu poate fi calculată.'};
  return {status:'observed',observations:comparable.length,first:{observedAt:first.observed_at,viewCount:toValue(first.view_count),commentCount:toValue(first.comment_count)},latest:{observedAt:latest.observed_at,viewCount:toValue(latest.view_count),commentCount:toValue(latest.comment_count)},viewChange:delta(toValue(first.view_count),toValue(latest.view_count)),commentChange:delta(toValue(first.comment_count),toValue(latest.comment_count)),limitation:'Schimbarea este observată între măsurători ale aceleiași surse; nu este o rată virală și nu reprezintă importanță sau adevăr.'};
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
    const observations=(await pool.query(`SELECT observed_at,view_count,comment_count FROM claim_observations WHERE claim_lead_id=$1 ORDER BY observed_at ASC`,[lead.id])).rows;
    lead.spread=calculateObservedSpread(observations);
  }
  return {rows:leads,total:count,page:safePage};
}

export async function setClaimLeadStatus(pool:pg.Pool,id:string,status:string) {
  if(!['new','reviewing','investigating','closed','dismissed'].includes(status)) throw new Error('Starea afirmației nu este validă.');
  const result=await pool.query(`UPDATE claim_leads SET editorial_status=$2,updated_at=now() WHERE id=$1 RETURNING id`,[id,status]);
  if(!result.rowCount) throw new Error('Afirmația nu există.');
}

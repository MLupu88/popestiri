import type pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {configuredSemanticClaimExtractor, deterministicSemanticExtract, validateSemanticExtraction} from './extractor.ts';
import {type ClaimExtractionInput, type SemanticClaimExtraction, type SemanticClaimExtractionProvider, type SemanticExtractionUsage} from './types.ts';

export type SemanticPilotMode = 'preview'|'dry_run'|'apply';

export type SemanticPilotOptions = {
  mode?: SemanticPilotMode;
  sampleLimit?: number;
  candidateIds?: string[];
  paid?: boolean;
  maxCalls?: number;
  maxOutputTokens?: number;
  provider?: SemanticClaimExtractionProvider;
};

export type SemanticGroundingDiagnostics = {
  sourceConsistent: boolean;
  evidenceCount: number;
  evidenceFields: string[];
  quotedAssertions: number;
  independentVerification: 'not_performed';
  truthfulness: 'unassessed';
  fallback?: string;
};

export type SemanticPilotResult = {
  candidateId: string;
  sourceKind: string;
  beforeClassifications: string[];
  afterClassification: string;
  assertionCount: number;
  sourceGrounding: SemanticGroundingDiagnostics;
  extraction: SemanticClaimExtraction;
  cacheHit: boolean;
  apiAttempted: boolean;
  acceptedExtraction: boolean;
  rejectedResponse: boolean;
  deterministicFallback: boolean;
  extractionOrigin: 'cache_hit'|'fresh_deepseek'|'deterministic'|'deterministic_fallback';
  usage: SemanticExtractionUsage|null;
};

export type SemanticPilotReport = {
  runId: string|null;
  mode: SemanticPilotMode;
  sampleLimit: number;
  paidEnabled: boolean;
  maxCalls: number;
  candidates: SemanticPilotResult[];
  summary: {
    candidateCount: number;
    beforeClassifications: Record<string,number>;
    afterClassifications: Record<string,number>;
    assertions: number;
    apiAttempts: number;
    acceptedExtractions: number;
    rejectedResponses: number;
    cacheHits: number;
    deterministicFallbacks: number;
    freshDeepSeekSuccesses: number;
    deterministicExtractions: number;
    cachedExtractions: number;
    usage: SemanticExtractionUsage;
  };
};

type PilotCandidate = {
  id: string;
  source_kind: string;
  source_bucket: string;
  source_name: string;
  source_id: string;
  original_url: string;
  title: string;
  summary: string|null;
  provenance: unknown;
  existing_classifications: unknown;
  has_existing_classification: boolean;
  state_content_fingerprint: string|null;
  state_extraction_method: string|null;
  state_extraction_model: string|null;
  state_extraction_version: string|null;
  state_extraction: unknown;
};

const jsonObject=(value:unknown):Record<string,any> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,any> : {};
const observations=(value:unknown):Record<string,any>[] => {
  const object=jsonObject(value);
  return Array.isArray(object.observations) ? object.observations.filter(item=>item&&typeof item==='object') : [];
};
const clean=(value:string,limit:number) => value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const stableJSON=(value:unknown):string => {
  if(value===null || typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  return `{${Object.keys(value as object).sort().map(key=>`${JSON.stringify(key)}:${stableJSON((value as Record<string,unknown>)[key])}`).join(',')}}`;
};
const SAMPLE_SEED='semantic-claim-pilot-v2';
const stableRank=(candidateId:string) => createHash('sha256').update(`${SAMPLE_SEED}:${candidateId}`).digest('hex');
const candidateFingerprint=(candidate:PilotCandidate) => createHash('sha256').update(stableJSON({originalUrl:candidate.original_url,title:candidate.title,summary:candidate.summary,sourceKind:candidate.source_kind,sourceId:candidate.source_id})).digest('hex');

function platform(candidate:PilotCandidate) {
  if(candidate.source_kind==='youtube_api') return 'youtube';
  if(candidate.source_kind==='google_trends') return 'google_trends';
  if(candidate.source_kind==='social_intake') {
    const value=observations(candidate.provenance).find(item=>['facebook','tiktok','youtube'].includes(String(item.platform)));
    return typeof value?.platform==='string' ? value.platform : 'social';
  }
  return 'rss';
}

function input(candidate:PilotCandidate): ClaimExtractionInput {
  return {candidateId:candidate.id,originalUrl:candidate.original_url,title:candidate.title,summary:candidate.summary,sourceKind:candidate.source_kind,sourceName:candidate.source_name,platform:platform(candidate)};
}

function beforeClassifications(value:unknown) {
  if(!Array.isArray(value)) return [];
  return [...new Set(value.filter(item=>typeof item==='string').sort())];
}

function diagnostics(extraction:SemanticClaimExtraction, fallback?:string):SemanticGroundingDiagnostics {
  const evidence=[...extraction.evidence,...extraction.assertions.flatMap(item=>item.evidence)];
  return {
    sourceConsistent:true,
    evidenceCount:evidence.length,
    evidenceFields:[...new Set(evidence.map(item=>item.field))].sort(),
    quotedAssertions:extraction.assertions.filter(item=>item.verbatimQuote!==null).length,
    independentVerification:'not_performed',
    truthfulness:extraction.truthfulness,
    ...(fallback ? {fallback} : {})
  };
}

function validateLimit(value:unknown, fallback:number, maximum:number, name:string) {
  if(value===undefined) return fallback;
  if(typeof value!=='number' || !Number.isSafeInteger(value) || value<0 || value>maximum) throw new Error(`${name} must be an integer between 0 and ${maximum}.`);
  return value;
}

function sortStable(rows:PilotCandidate[]) {return [...rows].sort((left,right)=>stableRank(left.id).localeCompare(stableRank(right.id)) || left.id.localeCompare(right.id));}

function chooseSample(rows:PilotCandidate[], limit:number) {
  const groups=new Map<string,PilotCandidate[]>();
  for(const row of sortStable(rows)) {
    const list=groups.get(row.source_bucket) ?? [];
    list.push(row);groups.set(row.source_bucket,list);
  }
  const priority=['rss','youtube','other'];
  const available=priority.filter(bucket=>(groups.get(bucket)?.length ?? 0)>0).concat([...groups.keys()].filter(bucket=>!priority.includes(bucket)));
  const selected:PilotCandidate[]=[];
  const take=(bucket:string,count:number) => {
    const list=groups.get(bucket) ?? [];
    const classified=list.find(row=>row.has_existing_classification);
    if(count>0 && classified) {selected.push(classified);}
    for(const row of list) if(selected.length<limit && selected.filter(item=>item.source_bucket===bucket).length<count && !selected.includes(row)) selected.push(row);
  };
  if(available.length>=2 && limit>=2) {
    const sourceBuckets=available.slice(0,2);
    take(sourceBuckets[0],Math.ceil(limit/2));
    take(sourceBuckets[1],Math.floor(limit/2));
  } else if(available.length) take(available[0],limit);
  for(const row of sortStable(rows)) if(selected.length<limit && !selected.includes(row)) selected.push(row);
  return selected.slice(0,limit);
}

async function candidates(pool:pg.Pool, options:SemanticPilotOptions, limit:number) {
  const ids=options.candidateIds ?? [];
  if(ids.length>20) throw new Error('The semantic pilot accepts at most 20 candidate IDs.');
  if(ids.some(id=>typeof id!=='string' || !id.trim() || id.length>200)) throw new Error('Candidate IDs must be non-empty strings of at most 200 characters.');
  const where=ids.length ? 'WHERE c.id=ANY($1::text[])' : '';
  const args=ids.length ? [ids,limit] : [limit];
  const order=ids.length ? 'array_position($1::text[],id)' : 'md5(id || \'semantic-claim-pilot-v2\')';
  const rows=(await pool.query(`WITH base AS (
      SELECT c.id,c.source_kind,c.source_name,c.source_id,c.original_url,c.title,c.summary,c.provenance,
        CASE WHEN c.source_kind='rss' THEN 'rss' WHEN c.source_kind='youtube_api' THEN 'youtube' ELSE 'other' END AS source_bucket,
        COALESCE(jsonb_agg(DISTINCT l.classification) FILTER (WHERE l.classification IS NOT NULL),'[]'::jsonb) AS existing_classifications,
        BOOL_OR(l.id IS NOT NULL) AS has_existing_classification,
        s.content_fingerprint AS state_content_fingerprint,s.extraction_method AS state_extraction_method,s.extraction_model AS state_extraction_model,
        s.extraction_version AS state_extraction_version,s.extraction AS state_extraction
      FROM discovery_candidates c
      LEFT JOIN claim_lead_references r ON r.candidate_id=c.id
      LEFT JOIN claim_leads l ON l.id=r.claim_lead_id
      LEFT JOIN semantic_claim_pilot_state s ON s.candidate_id=c.id
      ${where}
      GROUP BY c.id,s.content_fingerprint,s.extraction_method,s.extraction_model,s.extraction_version,s.extraction
    ), ranked AS (
      SELECT base.*,row_number() OVER (PARTITION BY source_bucket ORDER BY md5(id || 'semantic-claim-pilot-v2')) AS bucket_rank
      FROM base
    )
    SELECT * FROM ranked WHERE ${ids.length ? 'true' : 'bucket_rank <= $1'} ORDER BY ${order} LIMIT ${ids.length ? '$2' : 'GREATEST($1,1)'}`,args)).rows as PilotCandidate[];
  return ids.length ? rows : chooseSample(rows,limit);
}

function compatibleCache(candidate:PilotCandidate, provider:SemanticClaimExtractionProvider, fingerprint:string) {
  return candidate.state_content_fingerprint===fingerprint && candidate.state_extraction_method===provider.method && candidate.state_extraction_version===provider.extractionVersion && candidate.state_extraction_model===(provider.extractionModel ?? null) && candidate.state_extraction!==null;
}

function usageTotal(left:SemanticExtractionUsage,right:SemanticExtractionUsage):SemanticExtractionUsage {
  const add=(a:number|null,b:number|null) => a===null || b===null ? null : a+b;
  return {promptTokens:add(left.promptTokens,right.promptTokens),completionTokens:add(left.completionTokens,right.completionTokens),totalTokens:add(left.totalTokens,right.totalTokens)};
}
const unknownUsage=():SemanticExtractionUsage => ({promptTokens:null,completionTokens:null,totalTokens:null});

export async function runSemanticClaimPilot(pool:pg.Pool, options:SemanticPilotOptions = {}):Promise<SemanticPilotReport> {
  const mode=options.mode ?? 'preview';
  const sampleLimit=options.sampleLimit===undefined ? 20 : validateLimit(options.sampleLimit,20,20,'sampleLimit');
  if(sampleLimit<1) throw new Error('sampleLimit must be an integer between 1 and 20.');
  const maxCalls=validateLimit(options.maxCalls,0,20,'maxCalls');
  if(options.maxOutputTokens!==undefined && (typeof options.maxOutputTokens!=='number' || !Number.isSafeInteger(options.maxOutputTokens) || options.maxOutputTokens<128 || options.maxOutputTokens>2000)) throw new Error('maxOutputTokens must be an integer between 128 and 2000.');
  if(options.paid && mode!=='apply') throw new Error('Paid semantic extraction requires apply mode.');
  if(options.paid && process.env.SEMANTIC_CLAIM_PILOT_PAID!=='true') throw new Error('Set SEMANTIC_CLAIM_PILOT_PAID=true for paid semantic extraction.');
  if(options.paid && (!process.env.DEEPSEEK_API_KEY || !process.env.DEEPSEEK_FAST_MODEL)) throw new Error('Paid semantic extraction requires DeepSeek credentials and model configuration.');
  if(options.paid && maxCalls===0) throw new Error('Paid semantic extraction requires a positive maxCalls budget.');
  const runId=mode==='apply' ? randomUUID() : null;
  if(runId) await pool.query(`INSERT INTO semantic_claim_pilot_runs(id,mode,sample_limit,paid_enabled,max_calls,status) VALUES($1,$2,$3,$4,$5,'running')`,[runId,mode,sampleLimit,Boolean(options.paid),maxCalls]);
  try {
    const rows=await candidates(pool,options,sampleLimit);
    const provider=options.provider ?? configuredSemanticClaimExtractor({allowPaid:options.paid,maxCalls,maxOutputTokens:options.maxOutputTokens});
    if(options.paid && provider.method!=='deepseek') throw new Error('Paid semantic extraction failed closed: DeepSeek provider is unavailable.');
    const results:SemanticPilotResult[]=[];
    let apiAttempts=0,acceptedExtractions=0,rejectedResponses=0,deterministicFallbacks=0,paidCalls=0;
    let usage:SemanticExtractionUsage={promptTokens:0,completionTokens:0,totalTokens:0};
    for(const candidate of rows) {
      const fingerprint=candidateFingerprint(candidate);
      let extraction:SemanticClaimExtraction|undefined;
      let cacheHit=false;
      if(compatibleCache(candidate,provider,fingerprint)) {
        try {extraction=validateSemanticExtraction(candidate.state_extraction,input(candidate));cacheHit=true;acceptedExtractions++;} catch {extraction=undefined;}
      }
      let fallback:string|undefined;
      let apiAttempted=false,rejectedResponse=false,deterministicFallback=false;
      let extractionUsage:SemanticExtractionUsage|null=null;
      let extractionOrigin:SemanticPilotResult['extractionOrigin'];
      if(!extraction) {
        const budgetExhausted=options.paid===true && provider.method==='deepseek' && paidCalls>=maxCalls;
        apiAttempted=provider.method==='deepseek' && !budgetExhausted;
        if(apiAttempted) {apiAttempts++;paidCalls++;}
        if(budgetExhausted) {
          fallback='paid_budget_exhausted';deterministicFallback=true;deterministicFallbacks++;
          extraction=deterministicSemanticExtract(input(candidate));
          extractionOrigin='deterministic_fallback';
        } else {
          try {
            const candidateExtraction=await provider.extractSemantic(input(candidate));
            extractionUsage=provider.lastUsage ?? null;
            extraction=validateSemanticExtraction(candidateExtraction,input(candidate));
            acceptedExtractions++;
            extractionOrigin=provider.method==='deepseek' ? 'fresh_deepseek' : 'deterministic';
          } catch {
            extractionUsage=provider.lastUsage ?? null;
            rejectedResponse=apiAttempted;
            if(rejectedResponse) rejectedResponses++;
            deterministicFallback=true;deterministicFallbacks++;
            fallback=apiAttempted ? 'provider_rejected_or_unavailable' : 'deterministic_provider_error';
            extraction=deterministicSemanticExtract(input(candidate));
            extractionOrigin='deterministic_fallback';
          }
        }
        extraction=validateSemanticExtraction(extraction,input(candidate));
      }
      if(cacheHit) extractionOrigin='cache_hit';
      if(apiAttempted) usage=extractionUsage===null ? unknownUsage() : usageTotal(usage,extractionUsage);
      results.push({candidateId:candidate.id,sourceKind:candidate.source_kind,beforeClassifications:beforeClassifications(candidate.existing_classifications),afterClassification:extraction.classification,assertionCount:extraction.assertions.length,sourceGrounding:diagnostics(extraction,fallback),extraction,cacheHit,apiAttempted,acceptedExtraction:cacheHit || !deterministicFallback, rejectedResponse, deterministicFallback,extractionOrigin:extractionOrigin!,usage:extractionUsage});
    }
    const before:Record<string,number>={},after:Record<string,number>={};
    for(const result of results) {for(const item of result.beforeClassifications) before[item]=(before[item]??0)+1;after[result.afterClassification]=(after[result.afterClassification]??0)+1;}
    if(apiAttempts===0) usage=unknownUsage();
    const report:SemanticPilotReport={runId,mode,sampleLimit,paidEnabled:Boolean(options.paid),maxCalls,candidates:results,summary:{candidateCount:results.length,beforeClassifications:before,afterClassifications:after,assertions:results.reduce((total,item)=>total+item.assertionCount,0),apiAttempts,acceptedExtractions,rejectedResponses,cacheHits:results.filter(item=>item.cacheHit).length,deterministicFallbacks,freshDeepSeekSuccesses:results.filter(item=>item.extractionOrigin==='fresh_deepseek').length,deterministicExtractions:results.filter(item=>item.extractionOrigin==='deterministic').length,cachedExtractions:results.filter(item=>item.extractionOrigin==='cache_hit').length,usage}};
    if(runId) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        for(const [index,result] of results.entries()) {
          const candidate=rows[index], fingerprint=candidateFingerprint(candidate);
          const preserveSuccessfulDeepSeek=candidate.state_content_fingerprint===fingerprint && candidate.state_extraction_method==='deepseek' && candidate.state_extraction!==null;
          const preservePriorState=preserveSuccessfulDeepSeek && (result.deterministicFallback || provider.method==='deterministic_v1');
          if(!preservePriorState) await client.query(`INSERT INTO semantic_claim_pilot_state(candidate_id,content_fingerprint,extraction,extraction_method,extraction_model,extraction_version,paid_call,grounding_diagnostics,usage)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT(candidate_id) DO UPDATE SET content_fingerprint=EXCLUDED.content_fingerprint,extraction=EXCLUDED.extraction,extraction_method=EXCLUDED.extraction_method,extraction_model=EXCLUDED.extraction_model,extraction_version=EXCLUDED.extraction_version,paid_call=EXCLUDED.paid_call,last_processed_at=now(),grounding_diagnostics=EXCLUDED.grounding_diagnostics,usage=EXCLUDED.usage`,[candidate.id,fingerprint,JSON.stringify(result.extraction),result.extraction.extractionMethod,result.extraction.extractionModel,result.extraction.extractionVersion,result.apiAttempted && options.paid===true,JSON.stringify(result.sourceGrounding),JSON.stringify(result.usage)]);
          await client.query(`INSERT INTO semantic_claim_pilot_results(run_id,candidate_id,content_fingerprint,before_classifications,after_classification,assertion_count,extraction,grounding_diagnostics,cache_hit,paid_call,api_attempted,accepted_extraction,rejected_response,deterministic_fallback,extraction_origin,usage)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[runId,candidate.id,fingerprint,JSON.stringify(result.beforeClassifications),result.afterClassification,result.assertionCount,JSON.stringify(result.extraction),JSON.stringify(result.sourceGrounding),result.cacheHit,result.apiAttempted && options.paid===true,result.apiAttempted,result.acceptedExtraction,result.rejectedResponse,result.deterministicFallback,result.extractionOrigin,JSON.stringify(result.usage)]);
        }
        await client.query(`UPDATE semantic_claim_pilot_runs SET candidate_count=$2,api_attempts=$3,accepted_extractions=$4,rejected_responses=$5,cache_hits=$6,deterministic_fallbacks=$7,fresh_deepseek_successes=$8,deterministic_extractions=$9,cached_extractions=$10,usage=$11,status='completed',completed_at=now() WHERE id=$1`,[runId,results.length,apiAttempts,acceptedExtractions,rejectedResponses,report.summary.cacheHits,deterministicFallbacks,report.summary.freshDeepSeekSuccesses,report.summary.deterministicExtractions,report.summary.cachedExtractions,JSON.stringify(usage)]);
        await client.query('COMMIT');
      } catch(error) {
        await client.query('ROLLBACK');
        await pool.query(`UPDATE semantic_claim_pilot_runs SET status='failed',completed_at=now() WHERE id=$1`,[runId]);
        throw error;
      } finally {client.release();}
    }
    return report;
  } catch(error) {
    if(runId) await pool.query(`UPDATE semantic_claim_pilot_runs SET status='failed',completed_at=now() WHERE id=$1`,[runId]).catch(()=>undefined);
    throw error;
  }
}

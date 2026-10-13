import type pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {configuredSemanticClaimExtractor, deterministicSemanticExtract} from './extractor.ts';
import {semanticClaimExtractionSchema, type ClaimExtractionInput, type SemanticClaimExtraction, type SemanticClaimExtractionProvider} from './types.ts';

export type SemanticPilotMode = 'preview'|'dry_run'|'apply';

export type SemanticPilotOptions = {
  mode?: SemanticPilotMode;
  sampleLimit?: number;
  candidateIds?: string[];
  paid?: boolean;
  maxCalls?: number;
  provider?: SemanticClaimExtractionProvider;
};

export type SemanticPilotResult = {
  candidateId: string;
  sourceKind: string;
  beforeClassifications: string[];
  afterClassification: string;
  assertionCount: number;
  sourceGrounding: {
    valid: boolean;
    evidenceCount: number;
    evidenceFields: string[];
    quotedAssertions: number;
    truthfulness: 'unassessed';
    fallback?: string;
  };
  extraction: SemanticClaimExtraction;
  cacheHit: boolean;
  paidCall: boolean;
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
    cacheHits: number;
    paidCalls: number;
  };
};

type PilotCandidate = {
  id: string;
  source_kind: string;
  source_name: string;
  source_id: string;
  original_url: string;
  title: string;
  summary: string|null;
  provenance: unknown;
  existing_classifications: unknown;
  state_content_fingerprint: string|null;
  state_extraction_method: string|null;
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

function diagnostics(extraction:SemanticClaimExtraction, fallback?:string) {
  const evidence=[...extraction.evidence,...extraction.assertions.flatMap(item=>item.evidence)];
  return {valid:!fallback,evidenceCount:evidence.length,evidenceFields:[...new Set(evidence.map(item=>item.field))].sort(),quotedAssertions:extraction.assertions.filter(item=>item.verbatimQuote!==null).length,truthfulness:extraction.truthfulness as 'unassessed',...(fallback ? {fallback} : {})};
}

function validateLimit(value:unknown, fallback:number, maximum:number, name:string) {
  if(value===undefined) return fallback;
  if(typeof value!=='number' || !Number.isSafeInteger(value) || value<0 || value>maximum) throw new Error(`${name} must be an integer between 0 and ${maximum}.`);
  return value;
}

async function candidates(pool:pg.Pool, options:SemanticPilotOptions, limit:number) {
  const ids=options.candidateIds ?? [];
  if(ids.length>20) throw new Error('The semantic pilot accepts at most 20 candidate IDs.');
  const where=ids.length ? 'WHERE c.id=ANY($1::text[])' : '';
  const args=ids.length ? [ids,limit] : [limit];
  return (await pool.query(`SELECT c.id,c.source_kind,c.source_name,c.source_id,c.original_url,c.title,c.summary,c.provenance,
      COALESCE(jsonb_agg(DISTINCT l.classification) FILTER (WHERE l.classification IS NOT NULL),'[]'::jsonb) AS existing_classifications,
      s.content_fingerprint AS state_content_fingerprint,s.extraction_method AS state_extraction_method,s.extraction AS state_extraction
      FROM discovery_candidates c
      LEFT JOIN claim_lead_references r ON r.candidate_id=c.id
      LEFT JOIN claim_leads l ON l.id=r.claim_lead_id
      LEFT JOIN semantic_claim_pilot_state s ON s.candidate_id=c.id
      ${where}
      GROUP BY c.id,s.content_fingerprint,s.extraction_method,s.extraction
      ORDER BY c.updated_at DESC,c.id
      LIMIT ${ids.length ? '$2' : '$1'}`,args)).rows as PilotCandidate[];
}

export async function runSemanticClaimPilot(pool:pg.Pool, options:SemanticPilotOptions = {}):Promise<SemanticPilotReport> {
  const mode=options.mode ?? 'preview';
  const sampleLimit=options.sampleLimit===undefined ? 20 : validateLimit(options.sampleLimit,20,20,'sampleLimit');
  if(sampleLimit<1) throw new Error('sampleLimit must be an integer between 1 and 20.');
  const maxCalls=validateLimit(options.maxCalls,0,20,'maxCalls');
  if(options.paid && mode!=='apply') throw new Error('Paid semantic extraction requires apply mode.');
  if(options.paid && !options.provider && process.env.SEMANTIC_CLAIM_PILOT_PAID!=='true') throw new Error('Set SEMANTIC_CLAIM_PILOT_PAID=true for paid semantic extraction.');
  if(options.paid && maxCalls===0) throw new Error('Paid semantic extraction requires a positive maxCalls budget.');
  const runId=mode==='apply' ? randomUUID() : null;
  if(runId) await pool.query(`INSERT INTO semantic_claim_pilot_runs(id,mode,sample_limit,paid_enabled,max_calls,status) VALUES($1,$2,$3,$4,$5,'running')`,[runId,mode,sampleLimit,Boolean(options.paid),maxCalls]);
  try {
    const rows=await candidates(pool,options,sampleLimit);
    const provider=options.provider ?? configuredSemanticClaimExtractor({allowPaid:options.paid,maxCalls});
    const results:SemanticPilotResult[]=[];
    let paidAttempts=0;
    for(const candidate of rows) {
      const fingerprint=candidateFingerprint(candidate);
      let extraction:SemanticClaimExtraction|undefined;
      let cacheHit=false;
      const cacheAllowed=!options.paid || candidate.state_extraction_method==='deepseek';
      if(cacheAllowed && candidate.state_content_fingerprint===fingerprint && candidate.state_extraction) {
        try {extraction=semanticClaimExtractionSchema.parse(candidate.state_extraction);cacheHit=true;} catch {extraction=undefined;}
      }
      let fallback:string|undefined;
      let paidCall=false;
      if(!extraction) {
        paidCall=options.paid===true && provider.method==='deepseek' && paidAttempts<maxCalls;
        if(paidCall) paidAttempts++;
        try {extraction=await provider.extractSemantic(input(candidate));}
        catch {fallback='provider_rejected_or_unavailable';extraction=deterministicSemanticExtract(input(candidate));}
        if(!fallback && options.paid && provider.method==='deepseek' && extraction.extractionMethod==='deterministic_v1') fallback=paidCall ? 'provider_rejected_or_unavailable' : 'paid_budget_exhausted';
      }
      results.push({candidateId:candidate.id,sourceKind:candidate.source_kind,beforeClassifications:beforeClassifications(candidate.existing_classifications),afterClassification:extraction.classification,assertionCount:extraction.assertions.length,sourceGrounding:diagnostics(extraction,fallback),extraction,cacheHit,paidCall});
    }
    if(runId) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        for(const [index,result] of results.entries()) {
          const candidate=rows[index], fingerprint=candidateFingerprint(candidate);
          await client.query(`INSERT INTO semantic_claim_pilot_state(candidate_id,content_fingerprint,extraction,extraction_method,extraction_model,extraction_version,paid_call,grounding_diagnostics)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(candidate_id) DO UPDATE SET content_fingerprint=EXCLUDED.content_fingerprint,extraction=EXCLUDED.extraction,extraction_method=EXCLUDED.extraction_method,extraction_model=EXCLUDED.extraction_model,extraction_version=EXCLUDED.extraction_version,paid_call=EXCLUDED.paid_call,last_processed_at=now(),grounding_diagnostics=EXCLUDED.grounding_diagnostics`,[candidate.id,fingerprint,JSON.stringify(result.extraction),result.extraction.extractionMethod,result.extraction.extractionModel,result.extraction.extractionVersion,result.paidCall,JSON.stringify(result.sourceGrounding)]);
          await client.query(`INSERT INTO semantic_claim_pilot_results(run_id,candidate_id,content_fingerprint,before_classifications,after_classification,assertion_count,extraction,grounding_diagnostics,cache_hit,paid_call)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[runId,candidate.id,fingerprint,JSON.stringify(result.beforeClassifications),result.afterClassification,result.assertionCount,JSON.stringify(result.extraction),JSON.stringify(result.sourceGrounding),result.cacheHit,result.paidCall]);
        }
        await client.query(`UPDATE semantic_claim_pilot_runs SET candidate_count=$2,status='completed',completed_at=now() WHERE id=$1`,[runId,results.length]);
        await client.query('COMMIT');
      } catch(error) {
        await client.query('ROLLBACK');
        await pool.query(`UPDATE semantic_claim_pilot_runs SET status='failed',completed_at=now() WHERE id=$1`,[runId]);
        throw error;
      } finally {client.release();}
    }
    const before:Record<string,number>={},after:Record<string,number>={};
    for(const result of results) {for(const item of result.beforeClassifications) before[item]=(before[item]??0)+1;after[result.afterClassification]=(after[result.afterClassification]??0)+1;}
    return {runId,mode,sampleLimit,paidEnabled:Boolean(options.paid),maxCalls,candidates:results,summary:{candidateCount:results.length,beforeClassifications:before,afterClassifications:after,assertions:results.reduce((total,item)=>total+item.assertionCount,0),cacheHits:results.filter(item=>item.cacheHit).length,paidCalls:results.filter(item=>item.paidCall).length}};
  } catch(error) {
    if(runId) await pool.query(`UPDATE semantic_claim_pilot_runs SET status='failed',completed_at=now() WHERE id=$1`,[runId]).catch(()=>undefined);
    throw error;
  }
}

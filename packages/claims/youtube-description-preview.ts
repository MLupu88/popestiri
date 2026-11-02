import {createHash} from 'node:crypto';
import {deterministicSemanticExtract, validateSemanticExtraction} from './extractor.ts';
import type {ClaimExtractionInput, SemanticClaimExtraction} from './types.ts';

export type YouTubeDescriptionCandidate = {
  id: string;
  source_kind: string;
  source_name: string;
  title: string;
  summary: string | null;
  original_url: string;
  observed_at: string;
};

export type DescriptionStatus =
  | 'usable_description'
  | 'missing_or_short_description'
  | 'mostly_links_or_promotional'
  | 'untrusted_instructions'
  | 'invalid_video_source'
  | 'extraction_rejected';

export type SocialDescriptionAssertion = {
  text: string;
  evidenceExcerpt: string;
  evidenceField: 'summary';
  testability: 'testable';
  truthfulness: 'unassessed';
};

export type SocialDescriptionCase = {
  candidateId: string;
  videoUrl: string;
  headline: string;
  sourceName: string;
  observedAt: string;
  descriptionChars: number;
  descriptionStatus: DescriptionStatus;
  classification: 'testable_claim' | 'unassessed';
  descriptionAssertions: SocialDescriptionAssertion[];
  titleOnlyAssertionSuppressed: boolean;
  limitations: string;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const MAX_SCAN = 240;
const SCOPE = 'youtube-description-pilot-v1';
const LINK = /https?:\/\/\S+/giu;
const INSTRUCTION = /ignore previous instructions|system prompt|\[tool_call\]|<script|javascript:/iu;
const PROMOTIONAL = /abon(?:eaz[aă]-te|ament)|subscribe|urm[aă]re[sș]te|follow|like [sș]i share|cod reducere/iu;

function permittedVideoURL(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      !parsed.username && !parsed.password && !parsed.port &&
      (parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com') &&
      parsed.pathname === '/watch' &&
      /^[A-Za-z0-9_-]{1,64}$/.test(parsed.searchParams.get('v') ?? '');
  } catch {
    return false;
  }
}

function inspectDescription(candidate: YouTubeDescriptionCandidate): DescriptionStatus {
  if (candidate.source_kind !== 'youtube_api' || !permittedVideoURL(candidate.original_url)) return 'invalid_video_source';
  const summary = (candidate.summary ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (INSTRUCTION.test(summary)) return 'untrusted_instructions';
  const withoutLinks = summary.replace(LINK, ' ').replace(/#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (withoutLinks.length < 70 || withoutLinks.split(/\s+/).length < 10) return 'missing_or_short_description';
  const linkCount = (summary.match(LINK) ?? []).length;
  if (linkCount > 2 && (withoutLinks.length < 160 || PROMOTIONAL.test(withoutLinks))) return 'mostly_links_or_promotional';
  return 'usable_description';
}

function stableRank(candidate: YouTubeDescriptionCandidate) {
  return createHash('sha256').update(SCOPE + ':' + candidate.id).digest('hex');
}

function groundedSummaryAssertions(
  candidate: YouTubeDescriptionCandidate,
  extraction: SemanticClaimExtraction
): SocialDescriptionAssertion[] {
  const summary = (candidate.summary ?? '').replace(/\s+/g,' ').trim();
  return extraction.assertions
    .filter(item => item.testability === 'testable')
    .filter(item => item.evidence.some(e => e.field === 'summary' && e.supports &&
      e.candidateId === candidate.id && e.sourceUrl === candidate.original_url &&
      summary.includes(e.excerpt.replace(/\s+/g,' ').trim())))
    .map(item => ({
      text:item.assertionText,
      evidenceExcerpt:item.evidence.find(e=>e.field==='summary')!.excerpt,
      evidenceField:'summary' as const,
      testability:'testable' as const,
      truthfulness:'unassessed' as const
    }));
}

export function previewYouTubeDescriptions(
  rows: ReadonlyArray<YouTubeDescriptionCandidate>,
  options: {sampleLimit?:number} = {}
) {
  const sampleLimit=options.sampleLimit ?? DEFAULT_LIMIT;
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > MAX_LIMIT) {
    throw new Error('sampleLimit must be an integer from 1 to 20.');
  }
  // A stable non-recency sample across a bounded seven-day window. Prioritize
  // descriptions with actual text; include rejected ones when fewer than 20.
  const ranked=[...rows].sort((a,b)=>stableRank(a).localeCompare(stableRank(b)) || a.id.localeCompare(b.id));
  const eligible=ranked.filter(item=>inspectDescription(item)==='usable_description');
  const other=ranked.filter(item=>inspectDescription(item)!=='usable_description');
  const selected=[...eligible,...other].slice(0,sampleLimit);
  const cases:SocialDescriptionCase[]=[];
  for (const candidate of selected) {
    const preflight=inspectDescription(candidate);
    let classification:'testable_claim'|'unassessed'='unassessed';
    let assertions:SocialDescriptionAssertion[]=[];
    let status=preflight;
    let titleOnlyAssertionSuppressed=false;
    let limitations='YouTube channel description, NOT a transcript of speech or independent evidence. No truth verdict.';
    if (preflight==='usable_description') {
      const input:ClaimExtractionInput = {
        candidateId:candidate.id,originalUrl:candidate.original_url,
        title:candidate.title,summary:candidate.summary,
        sourceKind:'youtube_api',sourceName:candidate.source_name,platform:'youtube'
      };
      try {
        const extraction=validateSemanticExtraction(deterministicSemanticExtract(input),input);
        assertions=groundedSummaryAssertions(candidate,extraction);
        titleOnlyAssertionSuppressed=extraction.assertions.some(item=>item.testability==='testable') && assertions.length===0;
        if (assertions.length) classification='testable_claim';
      } catch {
        status='extraction_rejected';
        limitations='Deterministic description extraction failed strict source-grounding. Candidate is withheld; no assertion accepted.';
      }
    }
    cases.push({
      candidateId:candidate.id,videoUrl:candidate.original_url,
      headline:candidate.title,sourceName:candidate.source_name,
      observedAt:candidate.observed_at,
      descriptionChars:(candidate.summary??'').length,
      descriptionStatus:status,
      classification,descriptionAssertions:assertions,
      titleOnlyAssertionSuppressed,
      limitations
    });
  }
  return {
    event:'youtube_description_claim_preview',
    mode:'read_only',
    contentOrigin:'youtube_channel_description_metadata',
    transcriptPresent:false,
    independentVerification:'not_performed',
    truthfulness:'unassessed',
    maxScanned:MAX_SCAN,
    scannedCount:rows.length,
    descriptionUsableCount:eligible.length,
    sampleLimit,selectedCount:cases.length,
    testableDescriptionCases:cases.filter(item=>item.descriptionAssertions.length>0).length,
    testableDescriptionAssertions:cases.reduce((sum,item)=>sum+item.descriptionAssertions.length,0),
    titleOnlyClaimsSuppressed:cases.filter(item=>item.titleOnlyAssertionSuppressed).length,
    rejectionCounts:cases.reduce<Record<string,number>>((acc,item)=>{
      if(item.descriptionStatus!=='usable_description') acc[item.descriptionStatus]=(acc[item.descriptionStatus]??0)+1;
      return acc;
    },{}),
    cases,
    limitation:'Publisher-authored description only. No video audio/transcript, viral reach, independent fact check, LLM paid calls or database mutation.'
  };
}

export const MAX_YOUTUBE_DESCRIPTION_SCAN=MAX_SCAN;

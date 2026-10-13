import {z} from 'zod';

export const claimClassifications = ['testable_claim','ordinary_news_event','generic_broadcast','entertainment','uncertain'] as const;
export type ClaimClassification = typeof claimClassifications[number];
export const extractionMethods = ['deterministic_v1','deepseek','manual'] as const;
export type ClaimExtractionMethod = typeof extractionMethods[number];

export const claimEvidenceSchema = z.object({
  field: z.enum(['title','summary','description','manual']),
  excerpt: z.string().max(500),
  sourceUrl: z.string().max(2048),
  candidateId: z.string().max(200),
  supports: z.boolean()
});

export const claimExtractionSchema = z.object({
  assertionText: z.string().max(500).nullable(),
  exactText: z.string().max(1000).nullable(),
  machineParaphrase: z.string().max(500).nullable(),
  classification: z.enum(claimClassifications),
  extractionMethod: z.enum(extractionMethods),
  extractionModel: z.string().max(200).nullable(),
  extractionVersion: z.string().max(100),
  limitations: z.string().min(1).max(2000),
  evidence: z.array(claimEvidenceSchema).max(10)
});

export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;

export const claimTestability = ['testable','not_testable','uncertain'] as const;
export type ClaimTestability = typeof claimTestability[number];
export const claimEditorialRelevance = ['high','medium','low','uncertain'] as const;
export type ClaimEditorialRelevance = typeof claimEditorialRelevance[number];
export const claimVerificationPriority = ['high','medium','low','unassigned'] as const;
export type ClaimVerificationPriority = typeof claimVerificationPriority[number];

const quotedStatementSchema = z.object({
  text: z.string().min(1).max(1000),
  speaker: z.string().min(1).max(200),
  field: z.enum(['title','summary'])
});

export const semanticClaimAssertionSchema = z.object({
  assertionText: z.string().min(1).max(500),
  machineParaphrase: z.string().max(500).nullable(),
  attributedSpeaker: z.string().max(200).nullable(),
  verbatimQuote: quotedStatementSchema.nullable(),
  testability: z.enum(claimTestability),
  editorialRelevance: z.enum(claimEditorialRelevance),
  verificationPriority: z.enum(claimVerificationPriority),
  truthfulness: z.literal('unassessed'),
  evidence: z.array(claimEvidenceSchema).min(1).max(10)
});

export const semanticClaimExtractionSchema = z.object({
  sourceHeadline: z.string().max(1000),
  assertions: z.array(semanticClaimAssertionSchema).max(8),
  classification: z.enum(claimClassifications),
  extractionMethod: z.enum(['deterministic_v1','deepseek']),
  extractionModel: z.string().max(200).nullable(),
  extractionVersion: z.string().max(100),
  limitations: z.string().min(1).max(2000),
  truthfulness: z.literal('unassessed'),
  evidence: z.array(claimEvidenceSchema).max(20)
}).superRefine((value, context) => {
  if(value.classification==='testable_claim' && !value.assertions.some(assertion=>assertion.testability==='testable')) {
    context.addIssue({code:z.ZodIssueCode.custom,path:['assertions'],message:'testable_claim requires at least one objectively testable assertion.'});
  }
});

export type SemanticClaimAssertion = z.infer<typeof semanticClaimAssertionSchema>;
export type SemanticClaimExtraction = z.infer<typeof semanticClaimExtractionSchema>;

export type SemanticExtractionUsage = {
  promptTokens: number|null;
  completionTokens: number|null;
  totalTokens: number|null;
};

export interface SemanticClaimExtractionProvider {
  readonly method: 'deterministic_v1'|'deepseek';
  readonly extractionVersion?: string;
  readonly extractionModel?: string|null;
  readonly lastUsage?: SemanticExtractionUsage|null;
  extractSemantic(input: ClaimExtractionInput): Promise<SemanticClaimExtraction>;
}

export type ClaimExtractionInput = {
  candidateId: string;
  originalUrl: string;
  title: string;
  summary?: string | null;
  sourceKind: string;
  sourceName: string;
  platform: string;
};

export interface ClaimExtractionProvider {
  readonly method: ClaimExtractionMethod;
  extract(input: ClaimExtractionInput): Promise<ClaimExtraction>;
}

export type ClaimLeadSpread = {
  status: 'observed' | 'insufficient_history' | 'not_available' | 'not_applicable';
  observations: number;
  comparisons: Array<{
    candidateId: string;
    metricSource: string;
    first: {observedAt: string; viewCount: string | null; commentCount: string | null};
    latest: {observedAt: string; viewCount: string | null; commentCount: string | null};
    viewChange: string | null;
    commentChange: string | null;
  }>;
  first?: {observedAt: string; viewCount: string | null; commentCount: string | null};
  latest?: {observedAt: string; viewCount: string | null; commentCount: string | null};
  viewChange?: string | null;
  commentChange?: string | null;
  limitation: string;
};

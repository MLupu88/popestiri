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
  first?: {observedAt: string; viewCount: string | null; commentCount: string | null};
  latest?: {observedAt: string; viewCount: string | null; commentCount: string | null};
  viewChange?: string | null;
  commentChange?: string | null;
  limitation: string;
};

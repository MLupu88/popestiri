import { z } from 'zod';

export const Verdict = z.enum(['CONFIRMAT','CORECT, DAR LIPSEȘTE CONTEXT','CONTEXT FALS','CONTESTAT','NECONFIRMAT','FALS','NU ESTE O AFIRMAȚIE VERIFICABILĂ']);
export const Section = z.enum(['CE TREBUIE SĂ ȘTII AZI','CE VEDE ROMÂNIA','CE NU E CHIAR CUM PARE','FLASH GLOBAL']);
export const Platform = z.enum(['rss','trends','youtube','tiktok','instagram','facebook','manual']);
const Id = z.string().min(1);
export const Evidence = z.object({id:Id,claimId:Id,url:z.url(),publisher:z.string().min(1),independenceGroup:z.string().min(1).optional(),excerpt:z.string().min(1),tier:z.number().int().min(1).max(4),relation:z.enum(['supports','contradicts','contextualizes']),retrievedAt:z.iso.datetime()});
export const Claim = z.object({id:Id,clusterId:Id,text:z.string().min(1),verificationPriority:z.number().min(0).max(100),sensitive:z.boolean()});
export const Verification = z.object({claimId:Id,verdict:Verdict,explanation:z.string().min(1),evidenceIds:z.array(Id),checkedAt:z.iso.datetime(),reviewStatus:z.enum(['proposed','policy_accepted','operator_accepted'])});
export const Photo = z.object({id:Id,sourceUrl:z.url(),assetPath:z.string().min(1),credit:z.string().min(1),caption:z.string().min(1),rights:z.enum(['approved','unknown','rejected']),rightsBasis:z.string().min(1),width:z.number().int().positive(),height:z.number().int().positive(),focalX:z.number().min(0).max(1).default(.5),focalY:z.number().min(0).max(1).default(.5),illustrative:z.boolean()});
export const Article = z.object({id:Id,clusterId:Id,section:Section,headline:z.string().min(1),deck:z.string(),body:z.string().min(1),whyItMatters:z.string().optional(),photo:Photo,sourceUrls:z.array(z.url()).min(1),claims:z.array(Claim),verifications:z.array(Verification),evidence:z.array(Evidence),verificationRequired:z.boolean(),factualClaimsReviewed:z.boolean(),qrTarget:z.url(),revision:z.number().int().positive()});
export type Article = z.infer<typeof Article>;
export const SourceItem = z.object({id:Id,sourceId:Id,platform:Platform,url:z.url(),title:z.string(),excerpt:z.string(),publishedAt:z.iso.datetime(),fetchedAt:z.iso.datetime(),metrics:z.record(z.string(),z.number().nonnegative())});
export const Scores = z.object({attention:z.number().min(0).max(100),editorialRelevance:z.number().min(0).max(100),verificationPriority:z.number().min(0).max(100)});
export const Edition = z.object({id:Id,date:z.iso.date(),timezone:z.literal('Europe/Bucharest'),mode:z.enum(['fixture','live']),status:z.enum(['draft','validated','rendered','ready','blocked']),maxPages:z.literal(4),articles:z.array(Article),createdAt:z.iso.datetime()});
export type Edition = z.infer<typeof Edition>;
export type Verification = z.infer<typeof Verification>;

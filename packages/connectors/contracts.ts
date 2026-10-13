import type { z } from 'zod';
import type { SourceItem, Evidence, Claim, Verification } from '../core/contracts.ts';
export interface ProviderContext {runId:string; signal:AbortSignal; remainingBudget:number}
export interface SourceProvider {name:string; collect(since:Date,context:ProviderContext):Promise<z.infer<typeof SourceItem>[]>}
export interface SocialVideoProvider extends SourceProvider {getPermittedMedia(itemId:string,context:ProviderContext):Promise<{url:string;expiresAt:string}|null>}
export interface TranscriptProvider {transcribe(mediaUrl:string,language:string,context:ProviderContext):Promise<{text:string;segments:{start:number;end:number;text:string}[]}>}
export interface ResearchProvider {research(claim:z.infer<typeof Claim>,context:ProviderContext):Promise<z.infer<typeof Evidence>[]>}
export interface EditorialProvider {compareEvidence(claim:z.infer<typeof Claim>,evidence:z.infer<typeof Evidence>[],context:ProviderContext):Promise<Verification>}
export const providerConfig = [
  {id:'rss',keys:[],status:'implemented_manual'},
  {id:'google-trends',keys:[],status:'implemented_automatic'},
  {id:'youtube',keys:['YOUTUBE_API_KEY'],status:'implemented_automatic_optional'},
  {id:'tiktok',keys:['TIKTOK_PROVIDER','TIKTOK_API_KEY'],status:'planned_access_required'},
  {id:'instagram',keys:['INSTAGRAM_PROVIDER','INSTAGRAM_ACCESS_TOKEN'],status:'planned_access_required'},
  {id:'facebook',keys:['FACEBOOK_PROVIDER','FACEBOOK_ACCESS_TOKEN'],status:'planned_access_required'},
  {id:'deepgram',keys:['DEEPGRAM_API_KEY'],status:'interface_only'},
  {id:'tavily',keys:['TAVILY_API_KEY'],status:'interface_only'},
  {id:'deepseek',keys:['DEEPSEEK_API_KEY','DEEPSEEK_FAST_MODEL','DEEPSEEK_REASONING_MODEL'],status:'interface_only'}
] as const;

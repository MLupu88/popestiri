import {createHash, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {feedURL} from '../../packages/connectors/rss.ts';
import {importSource, saveFeedItems} from '../../packages/ingestion/rss.ts';
export {importSource, saveFeedItems} from '../../packages/ingestion/rss.ts';

export const socialPlatforms = ['facebook','tiktok','youtube'] as const;
export type SocialPlatform = typeof socialPlatforms[number];
export const socialStatuses = ['new','reviewing','investigating','closed'] as const;
export type SocialStatus = typeof socialStatuses[number];
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

export function socialURL(input: string) {
  if(input.length===0 || input.length>2048) throw new Error('Adresa trebuie să aibă între 1 și 2048 de caractere.');
  let parsed: URL;
  try {parsed=new URL(input);} catch {throw new Error('Adresa socială nu este validă.');}
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port) throw new Error('Folosește o adresă HTTPS publică, fără credențiale sau port personalizat.');
  const host=parsed.hostname.toLowerCase();
  let platform: SocialPlatform | undefined;
  if(socialHost(host,'facebook.com') || host==='fb.watch') platform='facebook';
  else if(socialHost(host,'tiktok.com')) platform='tiktok';
  else if(socialHost(host,'youtube.com') || host==='youtu.be') platform='youtube';
  if(!platform || parsed.pathname==='/' || parsed.pathname==='') throw new Error('Acceptăm doar linkuri publice Facebook, TikTok sau YouTube.');
  parsed.hash='';
  return {platform,originalUrl:input,canonicalUrl:parsed.href};
}

function requiredText(value: string, label: string, max: number) {
  const text=value.trim();
  if(!text || text.length>max || text.includes('\0')) throw new Error(`${label} trebuie să aibă între 1 și ${max} de caractere.`);
  return text;
}

function optionalText(value: string | undefined, label: string, max: number) {
  const text=(value??'').trim();
  if(text.length>max || text.includes('\0')) throw new Error(`${label} nu poate depăși ${max} de caractere.`);
  return text || undefined;
}

function status(value: string): SocialStatus {
  if(!socialStatuses.includes(value as SocialStatus)) throw new Error('Starea editorială nu este validă.');
  return value as SocialStatus;
}

function platform(value: string): SocialPlatform {
  if(!socialPlatforms.includes(value as SocialPlatform)) throw new Error('Platforma nu este validă.');
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
    if(!before) throw new Error('Semnalul social nu există.');
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
    if(key==='publishedAt' && clean && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error('Data publicării trebuie să folosească formatul AAAA-LL-ZZ.');
    if(clean) metadata[key]=clean;
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE social_intake_items SET claim_description=$2,investigation_reason=$3,metadata=$4,metadata_status=$5,updated_at=now()
      WHERE id=$1 RETURNING id`,[id,claimDescription,investigationReason,JSON.stringify(metadata),Object.keys(metadata).length?'manually_confirmed':'not_retrieved']);
    if(!result.rowCount) throw new Error('Semnalul social nu există.');
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
  const editions = (await pool.query(`SELECT id,edition_date,status,page_count FROM editions WHERE mode='live' ORDER BY edition_date DESC,revision DESC LIMIT 5`)).rows;
  return {counts,editions};
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

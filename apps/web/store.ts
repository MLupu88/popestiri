import {createHash, randomUUID} from 'node:crypto';
import type pg from 'pg';
import {downloadFeed, parseFeed, feedURL, type FeedItem} from '../../packages/connectors/rss.ts';

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
export async function saveFeedItems(pool: pg.Pool, sourceId: string, items: FeedItem[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = (await client.query(`SELECT enabled FROM sources WHERE id=$1 AND platform='rss' FOR UPDATE`,[sourceId])).rows[0];
    if(!source?.enabled) throw new Error('Sursa este dezactivată sau nu există.');
    let added = 0;
    for(const item of items) {
      const result = await client.query(`INSERT INTO source_items(id,source_id,canonical_url,title,excerpt,published_at,fetched_at,metadata)
        VALUES($1,$2,$3,$4,$5,$6,now(),$7) ON CONFLICT(source_id,canonical_url) DO NOTHING`,
        [randomUUID(),sourceId,item.url,item.title,item.excerpt,item.publishedAt,JSON.stringify({photo:item.photo,verificationStatus:'not_started',ingestion:'rss'})]);
      added += result.rowCount ?? 0;
    }
    await client.query(`UPDATE sources SET config=config || $2::jsonb WHERE id=$1`,[sourceId,JSON.stringify({lastImportAt:new Date().toISOString(),lastImportStatus:'ok',lastImportAdded:added,lastImportSeen:items.length})]);
    await client.query(`INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value) VALUES($1,'source',$2,'rss_import','operator','Import manual RSS',$3)`,[randomUUID(),sourceId,JSON.stringify({added,seen:items.length})]);
    await client.query('COMMIT'); return {added,seen:items.length};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
export async function importSource(pool: pg.Pool, id: string) {
  const source = (await pool.query(`SELECT config,enabled FROM sources WHERE id=$1 AND platform='rss'`,[id])).rows[0];
  if(!source?.enabled) throw new Error('Sursa este dezactivată sau nu există.');
  try {
    const feed = await downloadFeed(source.config.url);
    return await saveFeedItems(pool,id,parseFeed(feed.xml,feed.url));
  } catch(error) {
    await pool.query(`UPDATE sources SET config=config || $2::jsonb WHERE id=$1`,[id,JSON.stringify({lastImportAt:new Date().toISOString(),lastImportStatus:'error'})]);
    throw error;
  }
}

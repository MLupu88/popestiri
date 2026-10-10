import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {downloadFeed, parseFeed, type FeedItem} from '../connectors/rss.ts';

export type FeedDownloader = (url: string) => Promise<{xml: string; url: string}>;
export type ImportMode = 'manual' | 'batch';

export type SourceForImport = {id: string; name: string; config: {url: string}};

export type SourceImportResult = {added: number; seen: number; duplicates?: number};

export type ImportSourceOptions = {
  mode?: ImportMode;
  download?: FeedDownloader;
};

export type BatchImportSummary = {
  skipped: boolean;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  itemsRead: number;
  newArticles: number;
  duplicates: number;
  elapsedMs: number;
};

export type BatchImportOptions = {
  concurrency?: number;
  download?: FeedDownloader;
};

const BATCH_LOCK_KEY = 'popestiri:rss-batch-import';
const defaultDownload: FeedDownloader = downloadFeed;

function importActor(mode: ImportMode) {
  return mode === 'batch' ? 'worker' : 'operator';
}

function importReason(mode: ImportMode) {
  return mode === 'batch' ? 'Import RSS batch' : 'Import manual RSS';
}

export async function listEnabledSources(pool: pg.Pool): Promise<SourceForImport[]> {
  return (await pool.query(`
    SELECT id,name,config
    FROM sources
    WHERE platform='rss' AND enabled=true
    ORDER BY name,id
  `)).rows as SourceForImport[];
}

async function recordImportFailure(pool: pg.Pool, sourceId: string, mode: ImportMode) {
  // Do not persist provider error text: a feed URL may contain credentials or a token.
  try {
    await pool.query(`
      UPDATE sources
      SET config=config || $2::jsonb
      WHERE id=$1 AND platform='rss'
    `, [sourceId, JSON.stringify({
      lastImportAt: new Date().toISOString(),
      lastImportStatus: 'error',
      lastImportMode: mode
    })]);
    await pool.query(`
      INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value)
      VALUES($1,'source',$2,'rss_import_failed',$3,$4,$5)
    `, [randomUUID(), sourceId, importActor(mode), importReason(mode), JSON.stringify({status: 'error'})]);
  } catch {
    // Preserve the original provider or persistence failure for the caller.
  }
}

export async function saveFeedItems(
  pool: pg.Pool,
  sourceId: string,
  items: FeedItem[],
  mode: ImportMode = 'manual'
): Promise<SourceImportResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = (await client.query(`
      SELECT enabled
      FROM sources
      WHERE id=$1 AND platform='rss'
      FOR UPDATE
    `, [sourceId])).rows[0];
    if(!source?.enabled) throw new Error('Sursa este dezactivată sau nu există.');
    let added = 0;
    for(const item of items) {
      const result = await client.query(`
        INSERT INTO source_items(id,source_id,canonical_url,title,excerpt,published_at,fetched_at,metadata)
        VALUES($1,$2,$3,$4,$5,$6,now(),$7)
        ON CONFLICT(source_id,canonical_url) DO NOTHING
      `, [
        randomUUID(), sourceId, item.url, item.title, item.excerpt, item.publishedAt,
        JSON.stringify({photo: item.photo, verificationStatus: 'not_started', ingestion: 'rss'})
      ]);
      added += result.rowCount ?? 0;
    }
    const duplicates = items.length - added;
    await client.query(`
      UPDATE sources
      SET config=config || $2::jsonb
      WHERE id=$1
    `, [sourceId, JSON.stringify({
      lastImportAt: new Date().toISOString(),
      lastImportStatus: 'ok',
      lastImportMode: mode,
      lastImportAdded: added,
      lastImportSeen: items.length,
      lastImportDuplicates: duplicates
    })]);
    await client.query(`
      INSERT INTO audit_events(id,entity_type,entity_id,action,actor,reason,after_value)
      VALUES($1,'source',$2,'rss_import',$3,$4,$5)
    `, [
      randomUUID(), sourceId, importActor(mode), importReason(mode),
      JSON.stringify({added, seen: items.length, duplicates})
    ]);
    await client.query('COMMIT');
    return mode === 'batch'
      ? {added, seen: items.length, duplicates}
      : {added, seen: items.length};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function importSource(pool: pg.Pool, id: string, options: ImportSourceOptions = {}): Promise<SourceImportResult> {
  const mode = options.mode ?? 'manual';
  const source = (await pool.query(`
    SELECT config,enabled
    FROM sources
    WHERE id=$1 AND platform='rss'
  `, [id])).rows[0];
  if(!source?.enabled) throw new Error('Sursa este dezactivată sau nu există.');
  try {
    const feed = await (options.download ?? defaultDownload)(source.config.url);
    return await saveFeedItems(pool, id, parseFeed(feed.xml, feed.url), mode);
  } catch(error) {
    await recordImportFailure(pool, id, mode);
    throw error;
  }
}

async function acquireBatchLock(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [BATCH_LOCK_KEY]
    );
    if(!result.rows[0]?.acquired) {
      client.release();
      return null;
    }
    return client;
  } catch(error) {
    client.release();
    throw error;
  }
}

async function releaseBatchLock(client: {query(sql: string, params?: unknown[]): Promise<unknown>; release(): void}) {
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [BATCH_LOCK_KEY]);
  } finally {
    client.release();
  }
}

export async function importAllEnabledSources(pool: pg.Pool, options: BatchImportOptions = {}): Promise<BatchImportSummary> {
  const started = performance.now();
  const lock = await acquireBatchLock(pool);
  const empty = (skipped: boolean): BatchImportSummary => ({
    skipped,
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    itemsRead: 0,
    newArticles: 0,
    duplicates: 0,
    elapsedMs: Math.round(performance.now() - started)
  });
  if(!lock) return empty(true);

  try {
    const sources = await listEnabledSources(pool);
    if(!sources.length) return empty(false);
    const limit = Math.max(1, Math.min(2, Math.floor(options.concurrency ?? 2)));
    const results: Array<SourceImportResult | null> = Array(sources.length).fill(null);
    let next = 0;
    async function worker() {
      while(true) {
        const index = next++;
        if(index >= sources.length) return;
        try {
          results[index] = await importSource(pool, sources[index].id, {mode: 'batch', download: options.download});
        } catch {
          // A source is isolated so the remaining publishers still get imported.
        }
      }
    }
    await Promise.all(Array.from({length: Math.min(limit, sources.length)}, () => worker()));
    const successful = results.filter((result): result is SourceImportResult => result !== null);
    return {
      skipped: false,
      sourcesAttempted: sources.length,
      sourcesSucceeded: successful.length,
      sourcesFailed: sources.length - successful.length,
      itemsRead: successful.reduce((total, result) => total + result.seen, 0),
      newArticles: successful.reduce((total, result) => total + result.added, 0),
      duplicates: successful.reduce((total, result) => total + (result.duplicates ?? result.seen - result.added), 0),
      elapsedMs: Math.round(performance.now() - started)
    };
  } finally {
    await releaseBatchLock(lock);
  }
}

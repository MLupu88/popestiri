import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type pg from 'pg';
import {addSource, setSourceEnabled} from '../apps/web/store.ts';
import {importAllEnabledSources, type FeedDownloader} from '../packages/ingestion/rss.ts';

const migration = await readFile(new URL('../packages/db/migrations/0001_foundation.sql', import.meta.url), 'utf8');

function poolFor(db: PGlite) {
  const query = async (sql: string, args?: unknown[]) => {
    const result = await db.query(sql, args);
    return {rows: result.rows, rowCount: result.affectedRows ?? result.rows.length};
  };
  return {
    query,
    connect: async () => ({query, release() {}})
  } as unknown as pg.Pool;
}

function feed(title: string, url: string) {
  return `<rss><channel><item><title>${title}</title><link>${url}</link><description>Rezumat ${title}</description></item></channel></rss>`;
}

async function setup() {
  const db = new PGlite();
  await db.exec(migration);
  const pool = poolFor(db);
  return {db, pool};
}

test('batch imports enabled sources, isolates failures, preserves provenance, and never exceeds two feeds', async () => {
  const {db, pool} = await setup();
  try {
    await addSource(pool, 'Alpha', 'https://alpha.example/rss');
    await addSource(pool, 'Bravo', 'https://bravo.example/rss');
    await addSource(pool, 'Broken', 'https://broken.example/rss');
    await addSource(pool, 'Disabled', 'https://disabled.example/rss');
    const disabled = (await pool.query(`SELECT id FROM sources WHERE name='Disabled'`)).rows[0].id;
    await setSourceEnabled(pool, disabled, false);

    let active = 0;
    let maximum = 0;
    const requested: string[] = [];
    const download: FeedDownloader = async url => {
      requested.push(url);
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active--;
      if(url.includes('broken')) throw new Error('mock provider failure');
      const slug = new URL(url).hostname.split('.')[0];
      return {xml: feed(slug, `https://${slug}.example/articles/1`), url};
    };

    const summary = await importAllEnabledSources(pool, {download});
    assert.equal(summary.skipped, false);
    assert.deepEqual({
      sourcesAttempted: summary.sourcesAttempted,
      sourcesSucceeded: summary.sourcesSucceeded,
      sourcesFailed: summary.sourcesFailed,
      itemsRead: summary.itemsRead,
      newArticles: summary.newArticles,
      duplicates: summary.duplicates
    }, {sourcesAttempted: 3, sourcesSucceeded: 2, sourcesFailed: 1, itemsRead: 2, newArticles: 2, duplicates: 0});
    assert.equal(maximum, 2);
    assert.deepEqual(requested.sort(), [
      'https://alpha.example/rss',
      'https://bravo.example/rss',
      'https://broken.example/rss'
    ].sort());

    const articles = await pool.query(`SELECT s.name,i.source_id,i.metadata FROM source_items i JOIN sources s ON s.id=i.source_id ORDER BY s.name`);
    assert.deepEqual(articles.rows.map(row => row.name), ['Alpha', 'Bravo']);
    assert.equal(articles.rows.every(row => row.metadata.verificationStatus === 'not_started'), true);
    const failedHistory = await pool.query(`SELECT action,actor FROM audit_events WHERE action='rss_import_failed'`);
    assert.deepEqual(failedHistory.rows, [{action: 'rss_import_failed', actor: 'worker'}]);
    const successHistory = await pool.query(`SELECT action,actor FROM audit_events WHERE action='rss_import' AND actor='worker'`);
    assert.equal(successHistory.rows.length, 2);
  } finally {
    await db.close();
  }
});

test('repeat batch imports deduplicate per source and report duplicates', async () => {
  const {db, pool} = await setup();
  try {
    await addSource(pool, 'Repeat', 'https://repeat.example/rss');
    const download: FeedDownloader = async url => ({xml: `<rss><channel>
      <item><title>One</title><link>https://repeat.example/one</link></item>
      <item><title>Two</title><link>https://repeat.example/two</link></item>
    </channel></rss>`, url});
    const first = await importAllEnabledSources(pool, {download});
    const second = await importAllEnabledSources(pool, {download});
    assert.equal(first.newArticles, 2);
    assert.equal(first.duplicates, 0);
    assert.equal(second.itemsRead, 2);
    assert.equal(second.newArticles, 0);
    assert.equal(second.duplicates, 2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM source_items')).rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test('batch with no enabled sources exits cleanly without downloading', async () => {
  const {db, pool} = await setup();
  try {
    let called = false;
    const summary = await importAllEnabledSources(pool, {download: async () => {
      called = true;
      return {xml: '<rss/>', url: 'https://unused.example/rss'};
    }});
    assert.equal(summary.skipped, false);
    assert.equal(summary.sourcesAttempted, 0);
    assert.equal(summary.sourcesSucceeded, 0);
    assert.equal(summary.sourcesFailed, 0);
    assert.equal(called, false);
  } finally {
    await db.close();
  }
});

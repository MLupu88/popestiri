import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type pg from 'pg';
import {discoverGoogleTrends, discoverRSS, discoverYouTube, googleTrendsURL, youtubeAPIURL} from '../packages/discovery/adapters.ts';
import {conservativeGroupingKey} from '../packages/discovery/service.ts';
import {addSocialSubmission, listDiscoveries, setDiscoveryStatus, dashboard} from '../apps/web/store.ts';
import {discoveriesView} from '../apps/web/views.ts';

const migration = await readFile(new URL('../packages/db/migrations/0003_discovery.sql', import.meta.url), 'utf8');

function poolFor(db: PGlite) {
  const query = async (sql: string, args?: unknown[]) => {
    const result = await db.query(sql, args);
    return {rows: result.rows, rowCount: result.affectedRows ?? result.rows.length};
  };
  return {query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
}

test('official discovery endpoints are constrained to the validated public surfaces', () => {
  assert.equal(googleTrendsURL('https://trends.google.com/trending/rss?geo=RO').hostname, 'trends.google.com');
  assert.equal(youtubeAPIURL('https://www.googleapis.com/youtube/v3/search').pathname, '/youtube/v3/search');
  assert.throws(() => googleTrendsURL('https://trends.google.com/trending/rss?geo=US'));
  assert.throws(() => googleTrendsURL('https://evil.example/trending/rss?geo=RO'));
  assert.throws(() => youtubeAPIURL('http://www.googleapis.com/youtube/v3/search'));
});

test('Google Trends RSS discovery preserves provenance and observed rank/traffic signals', async () => {
  const source:any = {
    id:'google-trends-ro',kind:'google_trends',name:'Google Trends — România',
    endpoint_url:'https://trends.google.com/trending/rss?geo=RO',verification_url:'https://support.google.com/trends/answer/3076011',viewpoint:'search-interest',region:'RO',enabled:true,
    config:{},verified_at:'2026-10-11T00:00:00.000Z'
  };
  const result=await discoverGoogleTrends(source,{now:new Date('2026-10-11T10:00:00.000Z'),download:async()=>({url:source.endpoint_url,xml:`<rss xmlns:ht="https://trends.google.com/trendingsearches/daily"><channel><item><title>Un subiect</title><link>https://trends.google.com/trendingsearches/realtime?geo=RO&amp;q=subiect</link><ht:approx_traffic>20K+</ht:approx_traffic></item></channel></rss>`})});
  assert.equal(result.status,'succeeded');
  assert.equal(result.candidates.length,1);
  assert.deepEqual(result.candidates[0].popularitySignals,{rank:1,approximateTraffic:'20K+'});
  assert.equal(result.candidates[0].provenance.limitation,'Google Trends indicates search interest and related news grouping; it does not establish truth or public importance.');
});

test('YouTube discovery honestly stops without a key and never falls back to scraping', async () => {
  let called=false;
  const source:any={id:'youtube-api-ro',kind:'youtube_api',name:'YouTube Data API — România',endpoint_url:'https://www.googleapis.com/youtube/v3/search',verification_url:'https://developers.google.com/youtube/v3/docs/search/list',viewpoint:'video signal',region:'RO',enabled:true,config:{},verified_at:'2026-10-11T00:00:00.000Z'};
  const missing=await discoverYouTube(source,{apiKey:'',fetcher:async()=>{called=true;return new Response('{}');}});
  assert.equal(missing.status,'unavailable');
  assert.equal(missing.errorCode,'missing_youtube_api_key');
  assert.equal(called,false);
});

test('YouTube discovery uses official API responses and stores only returned metrics', async () => {
  const source:any={id:'youtube-api-ro',kind:'youtube_api',name:'YouTube Data API — România',endpoint_url:'https://www.googleapis.com/youtube/v3/search',verification_url:'https://developers.google.com/youtube/v3/docs/search/list',viewpoint:'video signal',region:'RO',enabled:true,config:{},verified_at:'2026-10-11T00:00:00.000Z'};
  const requested:string[]=[];
  const fetcher=async(url:string)=>{requested.push(url);if(url.includes('/search?')) return new Response(JSON.stringify({items:[{id:{videoId:'abc_123'},snippet:{title:'Titlu video',description:'Descriere',publishedAt:'2026-10-11T09:00:00.000Z'}}]}),{status:200});return new Response(JSON.stringify({items:[{id:'abc_123',statistics:{viewCount:'1234',commentCount:'7'}}]}),{status:200});};
  const result=await discoverYouTube(source,{apiKey:'test-key',queries:['știri România'],fetcher,now:new Date('2026-10-11T10:00:00.000Z')});
  assert.equal(result.status,'succeeded');
  const candidate=result.candidates[0];
  assert.ok(candidate);
  const signals=candidate.popularitySignals ?? {};
  assert.equal(signals.viewCount,'1234');
  assert.equal(signals.commentCount,'7');
  assert.equal(signals.likeCount,undefined);
  assert.equal(requested.length,2);
  assert.ok(requested.every(url=>url.startsWith('https://www.googleapis.com/youtube/v3/')));
});

test('discovery migration provides the unified inbox and workflow state without a truth verdict', async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../packages/db/migrations/0002_social_intake.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    const pool=poolFor(db);
    await addSocialSubmission(pool,{url:'https://youtu.be/discovery-1',submissionSource:'Pont cititor',claimDescription:'Semnal social suplimentar',investigationReason:'Necesită verificare.'});
    assert.equal((await pool.query('SELECT source_kind FROM discovery_candidates WHERE canonical_url=$1',['https://www.youtube.com/watch?v=discovery-1'])).rows[0].source_kind,'social_intake');
    await pool.query(`INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,observed_at,popularity_signals) VALUES('discovery-${'a'.repeat(32)}','rss-hotnews','rss','HotNews','https://hotnews.ro/a','https://hotnews.ro/a','Trei cuvinte despre eveniment',now(),'{}')`);
    const listed=await listDiscoveries(pool,'rss','new');
    assert.equal(listed.total,1);assert.equal(listed.rows[0].editorial_interest,null);assert.equal(listed.rows[0].verification_priority,null);
    await setDiscoveryStatus(pool,listed.rows[0].id,'reviewing');
    const view=discoveriesView(await listDiscoveries(pool,'rss','reviewing'),'rss','reviewing','csrf');
    assert.match(view,/Popularitatea observată, interesul editorial și prioritatea de verificare sunt câmpuri separate/);
    assert.match(view,/Nu deducem adevărul din volum/);
    const status=(await pool.query(`SELECT status FROM discovery_candidates WHERE id=$1`,[listed.rows[0].id])).rows[0].status;
    assert.equal(status,'reviewing');
    const dash=await dashboard(pool);assert.equal(dash.counts.discoveries,2);assert.equal(dash.counts.open_discoveries,2);
  } finally {await db.close();}
});

test('conservative grouping requires at least three meaningful title tokens', () => {
  assert.equal(conservativeGroupingKey('Alertă: trenul pleacă din București'), 'alerta|bucuresti|pleaca|trenul');
  assert.equal(conservativeGroupingKey('Un titlu'), null);
});

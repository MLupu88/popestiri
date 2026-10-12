import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type pg from 'pg';
import {discoverGoogleTrends, discoverRSS, discoverYouTube, googleTrendsURL, youtubeAPIURL} from '../packages/discovery/adapters.ts';
import {conservativeGroupingKey, groupRecentCandidates, loadAutomatedSources, persistDiscoveryCandidate, relatedDiscoveryCandidates, runDiscovery, topicComponents} from '../packages/discovery/service.ts';
import type {DiscoveryCandidateInput, DiscoverySource, AdapterResult} from '../packages/discovery/types.ts';
import {addSocialSubmission, listDiscoveries, setDiscoveryStatus, dashboard} from '../apps/web/store.ts';
import {discoveriesView} from '../apps/web/views.ts';

const migration = await readFile(new URL('../packages/db/migrations/0003_discovery.sql', import.meta.url), 'utf8');
const endpointMigration = await readFile(new URL('../packages/db/migrations/0004_discovery_endpoint_validation.sql', import.meta.url), 'utf8');
const inboxMigration = await readFile(new URL('../packages/db/migrations/0005_editorial_discovery_inbox.sql', import.meta.url), 'utf8');
const productionCompose = await readFile(new URL('../compose.production.yaml', import.meta.url), 'utf8');

function poolFor(db: PGlite) {
  const query = async (sql: string, args?: unknown[]) => {
    const result = await db.query(sql, args);
    return {rows: result.rows, rowCount: result.affectedRows ?? result.rows.length};
  };
  return {query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
}

async function discoveryPool() {
  const db=new PGlite();
  await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../packages/db/migrations/0002_social_intake.sql', import.meta.url),'utf8'));
  await db.exec(migration);
  await db.exec(endpointMigration);
  await db.exec(inboxMigration);
  return {db,pool:poolFor(db)};
}

test('official discovery endpoints are constrained to the validated public surfaces', () => {
  assert.equal(googleTrendsURL('https://trends.google.com/trending/rss?geo=RO').hostname, 'trends.google.com');
  assert.equal(youtubeAPIURL('https://www.googleapis.com/youtube/v3/search').pathname, '/youtube/v3/search');
  assert.throws(() => googleTrendsURL('https://trends.google.com/trending/rss?geo=US'));
  assert.throws(() => googleTrendsURL('https://evil.example/trending/rss?geo=RO'));
  assert.throws(() => youtubeAPIURL('http://www.googleapis.com/youtube/v3/search'));
});

test('production worker receives YouTube configuration through Compose without embedding secrets', () => {
  assert.match(productionCompose,/YOUTUBE_API_KEY: \$\{YOUTUBE_API_KEY:-\}/);
  assert.match(productionCompose,/YOUTUBE_DISCOVERY_QUERIES: \$\{YOUTUBE_DISCOVERY_QUERIES:-/);
  assert.doesNotMatch(productionCompose,/YOUTUBE_API_KEY:\s+['"]?[A-Za-z0-9_-]{20,}/);
});

test('manual Social Intake registry rows are never passed to automated adapters', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=await loadAutomatedSources(pool);
    assert.equal(sources.some(source=>source.kind==='social_intake'),false);
    assert.equal(sources.length,5);
    const executed:string[]=[];
    await runDiscovery(pool,{adapter:async source=>{
      executed.push(source.kind);
      return {adapter:`fixture:${source.id}`,status:'succeeded',seen:0,failed:0,candidates:[]};
    }});
    assert.equal(executed.includes('social_intake'),false);
  } finally {await db.close();}
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
  const fetcher=async(url:string)=>{requested.push(url);if(url.includes('/search?')) return new Response(JSON.stringify({items:[{id:{videoId:'abc_123'},snippet:{title:'Titlu video',description:'Descriere',publishedAt:'2026-10-11T09:00:00.000Z',channelId:'channel-123',channelTitle:'Canal România'}}]}),{status:200});if(url.includes('chart=mostPopular')) return new Response(JSON.stringify({items:[{id:'popular_1',snippet:{title:'Video popular',description:'Descriere populară',publishedAt:'2026-10-11T08:00:00.000Z',channelId:'popular-channel',channelTitle:'Canal popular'},statistics:{viewCount:'9000'}}]}),{status:200});return new Response(JSON.stringify({items:[{id:'abc_123',statistics:{viewCount:'1234',commentCount:'7'}}]}),{status:200});};
  const result=await discoverYouTube(source,{apiKey:'test-key',queries:['știri România'],fetcher,now:new Date('2026-10-11T10:00:00.000Z')});
  assert.equal(result.status,'succeeded');
  const candidate=result.candidates[0];
  assert.ok(candidate);
  const signals=candidate.popularitySignals ?? {};
  assert.equal(signals.viewCount,'1234');
  assert.equal(signals.commentCount,'7');
  assert.equal(candidate.provenance.channelId,'channel-123');
  assert.equal(candidate.provenance.channelTitle,'Canal România');
  assert.equal(candidate.provenance.videoId,'abc_123');
  assert.equal(candidate.provenance.apiProvider,'YouTube Data API v3');
  assert.equal(signals.capturedAt,'2026-10-11T10:00:00.000Z');
  assert.equal(signals.likeCount,undefined);
  assert.equal(requested.length,3);
  assert.ok(requested.some(url=>url.includes('chart=mostPopular')&&url.includes('regionCode=RO')));
  assert.equal(result.candidates.some(candidate=>candidate.popularitySignals?.observation==='most_popular_chart'),true);
  assert.ok(requested.every(url=>url.startsWith('https://www.googleapis.com/youtube/v3/')));
});

test('discovery migration provides the unified inbox and workflow state without a truth verdict', async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../packages/db/migrations/0002_social_intake.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    await db.exec(endpointMigration);
    await db.exec(inboxMigration);
    const pool=poolFor(db);
    assert.equal((await pool.query("SELECT endpoint_url FROM discovery_source_registry WHERE id='rss-hotnews'")).rows[0].endpoint_url,'https://hotnews.ro/feed');
    await addSocialSubmission(pool,{url:'https://youtu.be/discovery-1',submissionSource:'Pont cititor',claimDescription:'Semnal social suplimentar',investigationReason:'Necesită verificare.'});
    assert.equal((await pool.query('SELECT source_kind FROM discovery_candidates WHERE canonical_url=$1',['https://www.youtube.com/watch?v=discovery-1'])).rows[0].source_kind,'social_intake');
    assert.equal((await pool.query('SELECT provenance->\'observations\'->0->>\'sourceName\' AS source_name FROM discovery_candidates WHERE canonical_url=$1',['https://www.youtube.com/watch?v=discovery-1'])).rows[0].source_name,'Social Intake manual');
    await pool.query(`INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,observed_at,popularity_signals) VALUES('discovery-${'a'.repeat(32)}','rss-hotnews','rss','HotNews','https://hotnews.ro/a','https://hotnews.ro/a','Trei cuvinte despre eveniment',now(),'{}')`);
    const listed=await listDiscoveries(pool,'rss','new');
    assert.equal(listed.total,1);assert.equal(listed.rows[0].editorial_interest,null);assert.equal(listed.rows[0].verification_priority,null);
    await setDiscoveryStatus(pool,listed.rows[0].id,'reviewing');
    const view=discoveriesView(await listDiscoveries(pool,'rss','reviewing'),'rss','reviewing','csrf');
    assert.match(view,/Interesul editorial și prioritatea de verificare rămân necompletate/);
    assert.match(view,/Mai multe publicații înseamnă acoperire, nu dovadă/);
    const status=(await pool.query(`SELECT status FROM discovery_candidates WHERE id=$1`,[listed.rows[0].id])).rows[0].status;
    assert.equal(status,'reviewing');
    const dash=await dashboard(pool);assert.equal(dash.counts.discoveries,2);assert.equal(dash.counts.open_discoveries,2);
  } finally {await db.close();}
});

function candidate(source: DiscoverySource, canonicalUrl: string, title: string, provenanceSourceOrKind: string=source.name, sourceKind: DiscoveryCandidateInput['sourceKind']='rss'): DiscoveryCandidateInput {
  const provenanceSource=sourceKind==='rss' ? provenanceSourceOrKind : source.name;
  return {sourceId:source.id,sourceKind,sourceName:source.name,originalUrl:canonicalUrl,canonicalUrl,title,observedAt:'2026-10-11T10:00:00.000Z',publishedAt:null,provenance:{adapter:'test',registryId:source.id,sourceName:provenanceSource,verificationUrl:source.verification_url,viewpoint:source.viewpoint,limitation:'fixture'},popularitySignals:{}};
}

test('source and candidate failures are isolated and accurately marked partial', async () => {
  const {db,pool}=await discoveryPool();
  try {
    await pool.query("UPDATE discovery_source_registry SET enabled=false WHERE id NOT IN ('rss-hotnews','rss-digi24')");
    const adapter=async(source: DiscoverySource): Promise<AdapterResult> => {
      if(source.id==='rss-digi24') throw new Error('fixture provider unavailable');
      return {adapter:`fixture:${source.id}`,status:'succeeded',seen:2,failed:0,candidates:[candidate({...source,id:'missing-source'} as DiscoverySource,'https://invalid.example/bad','Bad candidate'),candidate(source,'https://valid.example/good','Un eveniment valid România')]};
    };
    const summary=await runDiscovery(pool,{adapter});
    assert.equal(summary.status,'partial');
    assert.equal(summary.candidatesAdded,1);
    assert.equal(summary.adapters.length,2);
    assert.equal(summary.adapters.some(result=>result.failed>0),true);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM discovery_candidates")).rows[0].count,1);
    const run=(await pool.query("SELECT status,adapter_results FROM discovery_runs ORDER BY started_at DESC LIMIT 1")).rows[0];
    assert.equal(run.status,'partial');
    assert.match(JSON.stringify(run.adapter_results),/adapter_source_failure|failed/);
  } finally {await db.close();}
});

test('canonical URL collisions retain independent source observations', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=(await loadAutomatedSources(pool)).filter(source=>source.id==='rss-hotnews'||source.id==='rss-digi24');
    await pool.query("UPDATE discovery_source_registry SET enabled=false WHERE id NOT IN ('rss-hotnews','rss-digi24')");
    for(const source of sources) await persistDiscoveryCandidate(pool,candidate(source,'https://shared.example/story','Același eveniment observat'));
    const row=(await pool.query("SELECT provenance FROM discovery_candidates WHERE canonical_url='https://shared.example/story'")).rows[0];
    const observations=row.provenance.observations;
    assert.equal(observations.length,2);
    assert.deepEqual(new Set(observations.map((observation:any)=>observation.sourceName)),new Set(['HotNews','Digi24']));
  } finally {await db.close();}
});

test('provisional grouping requires multiple sources, strong overlap and a short time window', () => {
  assert.equal(conservativeGroupingKey('Alertă: trenul pleacă din București'), 'alerta|bucuresti|pleaca|trenul');
  assert.equal(conservativeGroupingKey('Un titlu'), null);
  const make=(id:string,source_id:string,title:string,observed_at='2026-10-11T10:00:00.000Z')=>({id,source_id,source_name:source_id,title,observed_at,published_at:observed_at});
  const hotnews=make('a','rss-hotnews','Nicușor Dan prezintă măsuri pentru trafic');
  const digi=make('b','rss-digi24','Nicușor Dan anunță măsuri noi pentru trafic');
  const different=make('c','rss-digi24','Nicușor Dan anunță planuri noi pentru taxe');
  const repeated=make('d','rss-hotnews','Nicușor Dan anunță măsuri noi pentru trafic');
  assert.equal(relatedDiscoveryCandidates(hotnews,digi),true);
  assert.equal(relatedDiscoveryCandidates(hotnews,different),false);
  assert.equal(relatedDiscoveryCandidates(hotnews,repeated),false);
  assert.equal(topicComponents([hotnews,digi]).length,1);
  assert.equal(topicComponents([hotnews]).length,0);
  assert.equal(relatedDiscoveryCandidates(hotnews,make('e','rss-digi24','Nicușor Dan anunță măsuri noi pentru trafic','2026-10-13T10:00:00.000Z')),true);
  assert.equal(relatedDiscoveryCandidates(hotnews,make('f','rss-digi24','Nicușor Dan anunță măsuri noi pentru trafic','2026-10-15T10:00:00.000Z')),false);
});

test('topic grouping is not transitive and every completed group stays within 72 hours', () => {
  const make=(id:string,source_id:string,title:string,observed_at:string)=>({id,source_id,source_name:source_id,title,observed_at,published_at:observed_at});
  const a=make('chain-a','rss-hotnews','Nicușor Dan trafic proiect transport','2026-10-11T10:00:00.000Z');
  const b=make('chain-b','rss-digi24','Nicușor Dan trafic proiect taxe buget','2026-10-12T10:00:00.000Z');
  const c=make('chain-c','rss-g4media','Trafic proiect taxe buget școli','2026-10-14T11:01:00.000Z');
  assert.equal(relatedDiscoveryCandidates(a,b),true);
  assert.equal(relatedDiscoveryCandidates(b,c),true);
  assert.equal(relatedDiscoveryCandidates(a,c),false);
  const groups=topicComponents([a,b,c]);
  assert.deepEqual(groups.map(group=>group.map(candidate=>candidate.id)),[['chain-a','chain-b']]);
  const sameSourceA=make('same-a','rss-hotnews','Nicușor Dan trafic proiect transport','2026-10-11T10:00:00.000Z');
  const sameSourceB=make('same-b','rss-hotnews','Nicușor Dan trafic proiect transport','2026-10-11T11:00:00.000Z');
  const otherSource=make('same-c','rss-digi24','Nicușor Dan trafic proiect transport','2026-10-11T12:00:00.000Z');
  const repeatedSourceGroups=topicComponents([sameSourceA,sameSourceB,otherSource]);
  for (const group of repeatedSourceGroups) {
    assert.equal(new Set(group.map(candidate=>candidate.source_id)).size,group.length);
  }
});

test('historical self-groups are safely and idempotently detached without deleting candidates', async () => {
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../packages/db/migrations/0002_social_intake.sql',import.meta.url),'utf8'));
    await db.exec(migration);
    await db.exec(endpointMigration);
    await db.exec(`INSERT INTO discovery_candidates(id,source_id,source_kind,source_name,original_url,canonical_url,title,observed_at) VALUES('discovery-${'b'.repeat(32)}','rss-hotnews','rss','HotNews','https://hotnews.ro/history','https://hotnews.ro/history','Istoric','2025-01-01T10:00:00Z')`);
    await db.exec(`INSERT INTO discovery_groups(id,grouping_key,title,method,first_seen,last_seen) VALUES('group-${'b'.repeat(32)}','legacy-self','Istoric','conservative_title_overlap','2025-01-01T10:00:00Z','2025-01-01T10:00:00Z')`);
    await db.exec(`INSERT INTO discovery_group_members(group_id,candidate_id) VALUES('group-${'b'.repeat(32)}','discovery-${'b'.repeat(32)}')`);
    await db.exec(inboxMigration);
    await db.exec(inboxMigration);
    const candidates=await db.query(`SELECT count(*)::int AS count FROM discovery_candidates`);
    const groups=await db.query(`SELECT count(*)::int AS count FROM discovery_groups`);
    assert.equal((candidates.rows[0] as any).count,1);
    assert.equal((groups.rows[0] as any).count,0);
  } finally {await db.close();}
});

test('inbox displays a genuine multi-source topic once and keeps singleton signals separate', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=(await loadAutomatedSources(pool)).filter(source=>['rss-hotnews','rss-digi24','rss-g4media'].includes(source.id));
    const [hotnews,digi,g4]=sources;
    await persistDiscoveryCandidate(pool,candidate(hotnews,'https://hotnews.ro/topic','Nicușor Dan prezintă măsuri pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(digi,'https://digi24.ro/topic','Nicușor Dan anunță măsuri noi pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(g4,'https://g4media.ro/single','Un subiect izolat despre administrație'));
    await groupRecentCandidates(pool);
    const grouped=await pool.query(`SELECT count(*)::int AS groups FROM discovery_groups`);
    const members=await pool.query(`SELECT count(*)::int AS members FROM discovery_group_members`);
    assert.equal(grouped.rows[0].groups,1);
    assert.equal(members.rows[0].members,2);
    const listed=await listDiscoveries(pool,'','',1,'diversified');
    assert.equal(listed.total,2);
    assert.equal(listed.rows.filter((row:any)=>row.item_type==='group').length,1);
    assert.equal(listed.rows.find((row:any)=>row.item_type==='group').source_count,2);
    const rendered=discoveriesView(listed,'','','csrf');
    assert.match(rendered,/SUBIECT PROVIZORIU/);
    assert.match(rendered,/Vezi relatările independente și proveniența/);
    assert.match(rendered,/TikTok — planificat, nu este activ/);
    assert.equal((await dashboard(pool)).counts.multi_source_groups,1);
  } finally {await db.close();}
});

test('topic reconciliation rolls back to the previous complete state on failure', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=(await loadAutomatedSources(pool)).filter(source=>source.id==='rss-hotnews'||source.id==='rss-digi24');
    await persistDiscoveryCandidate(pool,candidate(sources[0],'https://hotnews.ro/atomic','Nicușor Dan prezintă măsuri pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(sources[1],'https://digi24.ro/atomic','Nicușor Dan anunță măsuri noi pentru trafic'));
    await groupRecentCandidates(pool);
    const before=await pool.query(`SELECT g.id,g.grouping_key,count(gm.candidate_id)::int AS members FROM discovery_groups g JOIN discovery_group_members gm ON gm.group_id=g.id GROUP BY g.id,g.grouping_key`);
    await db.exec(`CREATE OR REPLACE FUNCTION fail_group_rebuild() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rebuild failure'; END $$; CREATE TRIGGER fail_group_rebuild_trigger BEFORE INSERT ON discovery_group_members FOR EACH ROW EXECUTE FUNCTION fail_group_rebuild()`);
    await assert.rejects(groupRecentCandidates(pool),/fixture rebuild failure/);
    const after=await pool.query(`SELECT g.id,g.grouping_key,count(gm.candidate_id)::int AS members FROM discovery_groups g JOIN discovery_group_members gm ON gm.group_id=g.id GROUP BY g.id,g.grouping_key`);
    assert.deepEqual(after.rows,before.rows);
  } finally {await db.close();}
});

test('filtered groups count matching candidates separately from contextual coverage', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=(await loadAutomatedSources(pool)).filter(source=>['rss-hotnews','rss-digi24','google-trends-ro'].includes(source.id));
    await persistDiscoveryCandidate(pool,candidate(sources[0],'https://hotnews.ro/filter','Nicușor Dan prezintă măsuri pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(sources[1],'https://digi24.ro/filter','Nicușor Dan anunță măsuri noi pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(sources[2],'https://trends.google.com/filter','Nicușor Dan discută măsuri noi pentru trafic',sources[2].name,'google_trends'));
    await pool.query(`UPDATE discovery_candidates SET status='reviewing' WHERE canonical_url='https://digi24.ro/filter'`);
    await groupRecentCandidates(pool);
    const listed=await listDiscoveries(pool,'google_trends','new',1,'recent');
    assert.equal(listed.total,1);
    assert.equal(listed.group_total,1);
    assert.equal(listed.rows.length,1);
    assert.equal(listed.rows[0].matching_candidate_count,1);
    assert.equal(listed.rows[0].candidate_count,3);
    assert.equal(listed.rows[0].contextual_candidate_count,2);
    assert.equal((listed.rows[0].members as any[]).filter(member=>member.matches_filter).length,1);
    const rendered=discoveriesView(listed,'google_trends','new','csrf','recent');
    assert.match(rendered,/1 candidați potriviți · 3 în total · 3 surse/);
    assert.match(rendered,/membri sunt afișați doar ca acoperire contextuală/);
    assert.match(rendered,/Acoperire contextuală/);
  } finally {await db.close();}
});

test('filtered groups require one candidate to match channel and status together', async () => {
  const {db,pool}=await discoveryPool();
  try {
    const sources=(await loadAutomatedSources(pool)).filter(source=>['rss-hotnews','google-trends-ro'].includes(source.id));
    await persistDiscoveryCandidate(pool,candidate(sources[0],'https://hotnews.ro/filter-same','Nicușor Dan prezintă măsuri pentru trafic'));
    await persistDiscoveryCandidate(pool,candidate(sources[1],'https://trends.google.com/filter-same','Nicușor Dan discută măsuri noi pentru trafic',sources[1].name,'google_trends'));
    await pool.query(`UPDATE discovery_candidates SET status='reviewing' WHERE canonical_url='https://hotnews.ro/filter-same'`);
    await groupRecentCandidates(pool);

    const listed=await listDiscoveries(pool,'google_trends','reviewing',1,'recent');
    assert.equal(listed.total,0);
    assert.equal(listed.group_total,0);
    assert.equal(listed.rows.length,0);

    const preserved=(await pool.query(`SELECT count(*)::int AS count FROM discovery_candidates`)).rows[0];
    assert.equal(preserved.count,2);
  } finally {await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type pg from 'pg';
import {createSession, validSession, csrfToken, sessionCookie} from '../apps/web/auth.ts';
import {parseFeed, feedURL, publicIPv4} from '../packages/connectors/rss.ts';
import {addSource, setSourceEnabled, listSources, saveFeedItems, listArticles, dashboard} from '../apps/web/store.ts';
import {articlesView} from '../apps/web/views.ts';
const secret='test-secret-with-at-least-32-characters';

test('sessions expire, reject tampering and token rotation; production cookies are secure',()=>{
 const now=1700000000000,session=createSession(secret,now);
 assert.ok(validSession(session,secret,now));
 assert.equal(validSession(session,secret+'changed',now),false);
 assert.equal(validSession(session+'x',secret,now),false);
 assert.equal(validSession(session,secret,now+8*60*60*1000),false);
 assert.notEqual(csrfToken(session,secret),csrfToken(createSession(secret,now),secret));
 assert.match(sessionCookie(session,true),/HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
});
test('RSS blocks private destinations, alternate numeric IPs, credentials and unsafe protocols',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.2','192.0.0.1','169.254.169.254','100.64.1.2','198.18.0.1','0.0.0.0','224.1.2.3','::1']) assert.equal(publicIPv4(ip),false,ip);
 assert.equal(publicIPv4('192.0.66.98'),true);
 assert.equal(publicIPv4('8.8.8.8'),true);
 for(const url of ['http://example.com/rss','https://127.1/rss','https://2130706433/rss','https://[::1]/','https://user:password@example.com/rss','https://example.com:8080/rss']) assert.throws(()=>feedURL(url));
});
test('RSS and Atom retain source/photo provenance; feed entries are not verified',()=>{
 const rss=`<rss><channel><item><title><![CDATA[Un titlu <script>alert(1)</script>]]></title><link>https://news.example/story#part</link><description><![CDATA[<b>Rezumat</b>]]></description><enclosure type="image/jpeg" url="https://news.example/photo.jpg"/><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Duplicat</title><link>https://news.example/story</link></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>`;
 const items=parseFeed(rss,'https://news.example/rss');
 assert.equal(items.length,1);assert.equal(items[0].excerpt,'Rezumat');assert.equal(items[0].photo?.rightsStatus,'unknown');assert.equal(items[0].photo?.sourceURL,items[0].url);assert.equal(items[0].publishedAt,'2026-10-09T10:00:00.000Z');
 const atom=parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link rel="self" href="/feed/1"/><link rel="alternate" href="/article"/><updated>not-a-date</updated></entry></feed>`,'https://news.example/rss');
 assert.equal(atom[0].url,'https://news.example/article');assert.equal(atom[0].publishedAt,null);
 assert.throws(()=>parseFeed('<html><body>Not a feed</body></html>','https://example.com'));
 assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY x "test">]><rss/>','https://example.com'));
});
test('article markup escapes source text and URLs',()=>{
 const html=articlesView({total:1,rows:[{title:'<script>alert(1)</script>',canonical_url:'https://example.com/" onmouseover="alert(1)',source_name:'<img src=x>',excerpt:'<svg onload=alert(1)>',metadata:{}}]},[],'',1);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<svg '));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&quot;'));
});
test('admin persists sources, deduplicates repeated imports, and never creates an edition or approves imagery',async()=>{
 const db=new PGlite();
 await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
 const query=async(sql:string,args?:unknown[])=>{const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
 try {
  assert.equal(await addSource(pool,'Test RSS','https://news.example/rss'),true);
  assert.equal(await addSource(pool,'Same feed','https://news.example/rss'),false);
  const [source]=await listSources(pool);
  const items=parseFeed('<rss><channel><item><title>One</title><link>https://news.example/one</link><enclosure type="image/png" url="https://news.example/one.png"/></item></channel></rss>','https://news.example/rss');
  assert.deepEqual(await saveFeedItems(pool,source.id,items),{added:1,seen:1});
  assert.deepEqual(await saveFeedItems(pool,source.id,items),{added:0,seen:1});
  const articles=await listArticles(pool,source.id,1);
  assert.equal(articles.total,1);assert.equal(articles.rows[0].metadata.photo.rightsStatus,'unknown');assert.equal(articles.rows[0].metadata.verificationStatus,'not_started');
  const status=await dashboard(pool);assert.equal(status.counts.articles,1);assert.equal(status.editions.length,0);
  await setSourceEnabled(pool,source.id,false);
  await assert.rejects(saveFeedItems(pool,source.id,items),/dezactivată/);
  assert.equal((await listSources(pool))[0].enabled,false);
 } finally {await db.close();}
});

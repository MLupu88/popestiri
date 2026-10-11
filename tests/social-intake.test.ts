import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type pg from 'pg';
import {addSocialSubmission, getSocialIntake, listSocialIntake, setSocialStatus, socialURL, updateSocialEnrichment} from '../apps/web/store.ts';
import {socialIntakeDetailView, socialIntakeView} from '../apps/web/views.ts';

async function testPool() {
  const db=new PGlite();
  await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../packages/db/migrations/0002_social_intake.sql',import.meta.url),'utf8'));
  const query=async(sql:string,args?:unknown[])=>{const result=await db.query(sql,args);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};};
  const pool={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
  return {db,pool};
}

test('social URL validation identifies supported platforms and blocks unsafe or unsupported URLs',()=>{
  assert.equal(socialURL('https://www.facebook.com/example/posts/1').platform,'facebook');
  assert.equal(socialURL('https://www.tiktok.com/@creator/video/1').platform,'tiktok');
  assert.equal(socialURL('https://youtu.be/video-1#comments').platform,'youtube');
  assert.equal(socialURL('https://youtu.be/video-1#comments').canonicalUrl,'https://youtu.be/video-1');
  for(const url of ['http://youtube.com/watch?v=1','https://evil.example/youtube.com/watch?v=1','https://user:pass@facebook.com/post/1','https://youtube.com:8443/watch?v=1','https://facebook.com/','https://facebook.com.evil.example/post/1']) assert.throws(()=>socialURL(url));
});

test('social intake deduplicates canonical URLs while retaining every submission provenance',async()=>{
  const {db,pool}=await testPool();
  try {
    const first=await addSocialSubmission(pool,{url:'https://youtu.be/video-1#first',submissionSource:'Pont cititor',claimDescription:'Afirmație inițială',investigationReason:'Poate afecta interesul public.'});
    const second=await addSocialSubmission(pool,{url:'https://youtu.be/video-1#second',submissionSource:'Monitorizare manuală',claimDescription:'Aceeași afirmație observată din nou',investigationReason:'A reapărut în distribuire.'});
    assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);assert.equal(first.id,second.id);
    const detail=await getSocialIntake(pool,first.id);
    assert.ok(detail);assert.equal(detail.item.original_url,'https://youtu.be/video-1#first');assert.equal(detail.item.editorial_status,'new');assert.deepEqual(detail.item.metadata,{});assert.equal(detail.item.metadata_status,'not_retrieved');
    assert.equal(detail.provenance.length,2);assert.deepEqual(detail.provenance.map(row=>row.submission_source).sort(),['Monitorizare manuală','Pont cititor']);
    const actions=(await pool.query("SELECT action FROM audit_events WHERE entity_type='social_intake' ORDER BY created_at,id")).rows.map((row:any)=>row.action);
    assert.deepEqual(actions,['social_intake_submitted','social_intake_duplicate_submitted']);
  } finally {await db.close();}
});

test('social intake supports manual enrichment and workflow statuses without creating a verdict',async()=>{
  const {db,pool}=await testPool();
  try {
    const created=await addSocialSubmission(pool,{url:'https://www.tiktok.com/@creator/video/2',submissionSource:'Redacție',claimDescription:'Descriere neconfirmată',investigationReason:'Necesită verificare.'});
    await updateSocialEnrichment(pool,created.id,{claimDescription:'Descriere actualizată',investigationReason:'A fost semnalată de mai multe persoane.',title:'Titlu confirmat',author:'Autor confirmat',publishedAt:'2026-10-10',notes:'Metadata introdusă de operator.'});
    await setSocialStatus(pool,created.id,'investigating');
    const detail=await getSocialIntake(pool,created.id);
    assert.ok(detail);assert.equal(detail.item.editorial_status,'investigating');assert.equal(detail.item.metadata_status,'manually_confirmed');assert.equal(detail.item.metadata.author,'Autor confirmat');
    assert.equal(detail.item.verdict,undefined);
    const filtered=await listSocialIntake(pool,'tiktok','investigating');assert.equal(filtered.total,1);assert.equal(filtered.rows[0].id,created.id);
    await assert.rejects(setSocialStatus(pool,created.id,'false'),/Starea editorială nu este validă/);
    const html=socialIntakeDetailView(detail,'csrf-token');assert.ok(html.includes('Starea descrie fluxul redacțional, nu adevărul afirmației.'));assert.ok(!html.includes('<script>'));
  } finally {await db.close();}
});

test('social intake HTML escapes untrusted URL and text and states unavailable metadata honestly',()=>{
  const html=socialIntakeView({rows:[{id:'social-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',platform:'facebook',editorial_status:'new',claim_description:'<script>alert(1)</script>',submission_source:'<img src=x>',submitted_at:'2026-10-10T10:00:00Z',original_url:'https://facebook.com/post/1?a="x"',investigation_reason:'<svg onload=alert(1)>'}],total:1,page:1},'','', 'csrf');
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<svg '));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&quot;x&quot;'));assert.ok(html.includes('Nu extragem automat transcript'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('PostgreSQL migration enforces edition, provenance and print retry constraints',async()=>{
 const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO editions(id,edition_date,mode,status) VALUES('e','2026-10-09','fixture','draft')");
  await assert.rejects(db.exec("UPDATE editions SET status='ready' WHERE id='e'"));
  await assert.rejects(db.exec("UPDATE editions SET page_count=5 WHERE id='e'"));
  await db.exec("INSERT INTO print_jobs(id,edition_id,request_id,printer,pdf_checksum,state) VALUES('p','e','first','Office','abc','pending')");
  await assert.rejects(db.exec("INSERT INTO print_jobs(id,edition_id,request_id,printer,pdf_checksum,state) VALUES('p2','e','first','Office','abc','pending')"));
  await db.exec("INSERT INTO story_clusters(id,title,first_seen,last_seen) VALUES('c','Fixture',now(),now()); INSERT INTO claims(id,cluster_id,exact_text,priority) VALUES('c1','c','one',50),('c2','c','two',50)");
  await db.exec("INSERT INTO evidence(id,claim_id,url,publisher,excerpt,source_tier,relation,retrieved_at) VALUES('ev','c1','https://example.org','Fixture publisher','fixture',1,'supports',now()); INSERT INTO verifications(id,claim_id,revision,verdict,explanation,checked_at,review_status) VALUES('v','c2',1,'NECONFIRMAT','fixture',now(),'proposed')");
  await assert.rejects(db.exec("INSERT INTO verification_evidence VALUES('v','c2','ev')"));
 }finally{await db.close();}
});

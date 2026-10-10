import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {runStage} from '../packages/db/stages.ts';
test('failed stage resumes; succeeded stage returns its persisted output',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../packages/db/migrations/0001_foundation.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO pipeline_runs(id,idempotency_key,state) VALUES('r','daily-fixture','running')");
  await assert.rejects(runStage(db,'r','collect',async()=>{throw new Error('provider temporarily unavailable')}));
  let calls=0;
  const work=async()=>{calls++;return {count:3}};
  const first=await runStage(db,'r','collect',work);
  const retry=await runStage(db,'r','collect',work);
  assert.equal(first.cached,false);assert.equal(retry.cached,true);assert.equal(calls,1);assert.deepEqual(retry.output,{count:3});
  const result=await db.query<{attempt:number}>('SELECT attempt FROM stage_runs');assert.equal(result.rows[0].attempt,2);
 }finally{await db.close();}
});

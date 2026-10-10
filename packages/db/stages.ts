import {randomUUID} from 'node:crypto';
export interface QueryClient {query(sql:string,params?:unknown[]):Promise<{rows:any[]}>}
export async function runStage(db:QueryClient,runId:string,stage:string,work:()=>Promise<unknown>):Promise<{cached:boolean;output:unknown}>{
 await db.query("INSERT INTO stage_runs(id,run_id,stage,state) VALUES($1,$2,$3,'pending') ON CONFLICT(run_id,stage) DO NOTHING",[randomUUID(),runId,stage]);
 const acquired=await db.query("UPDATE stage_runs SET state='running',attempt=attempt+1,lease_until=now()+interval '5 minutes' WHERE run_id=$1 AND stage=$2 AND (state IN ('pending','failed') OR (state='running' AND lease_until<now())) RETURNING attempt",[runId,stage]);
 if(!acquired.rows.length){
  const old=await db.query('SELECT state,output FROM stage_runs WHERE run_id=$1 AND stage=$2',[runId,stage]);
  if(old.rows[0]?.state==='succeeded')return {cached:true,output:old.rows[0].output};
  throw new Error('Stage currently leased by another worker');
 }
 const attempt=acquired.rows[0].attempt;
 try{
  const output=await work();
  const saved=await db.query("UPDATE stage_runs SET state='succeeded',output=$4::jsonb,error=NULL,lease_until=NULL WHERE run_id=$1 AND stage=$2 AND attempt=$3 AND state='running' RETURNING id",[runId,stage,attempt,JSON.stringify(output??null)]);
  if(!saved.rows.length)throw new Error('Stage lease was superseded');
  return {cached:false,output};
 }catch(e){
  await db.query("UPDATE stage_runs SET state='failed',error=$4::jsonb,lease_until=NULL WHERE run_id=$1 AND stage=$2 AND attempt=$3 AND state='running'",[runId,stage,attempt,JSON.stringify({message:e instanceof Error?e.message:'Unknown error'})]);
  throw e;
 }
}
// Stage work must be idempotent; a crash after a provider call can repeat that call.
// This foundation uses a 5-minute lease; long work must later implement heartbeats.

import pg from 'pg';
import {runSemanticClaimPilot, type SemanticPilotMode} from '../../packages/claims/pilot.ts';

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');

const args=process.argv.slice(2);
const mode:SemanticPilotMode=args.includes('--apply') ? 'apply' : args.includes('--dry-run') ? 'dry_run' : 'preview';
const paid=args.includes('--paid');
const limitArg=args.find(value=>value.startsWith('--limit='))?.slice('--limit='.length);
const maxCallsArg=args.find(value=>value.startsWith('--max-calls='))?.slice('--max-calls='.length);
const maxOutputTokensArg=args.find(value=>value.startsWith('--max-output-tokens='))?.slice('--max-output-tokens='.length);
const candidateIds=args.flatMap(value=>value.startsWith('--candidate-id=') ? [value.slice('--candidate-id='.length)] : value.startsWith('--candidate-ids=') ? value.slice('--candidate-ids='.length).split(',').map(item=>item.trim()).filter(Boolean) : []);
const sampleLimit=limitArg===undefined ? undefined : Number(limitArg);
const maxCalls=maxCallsArg===undefined ? undefined : Number(maxCallsArg);
const maxOutputTokens=maxOutputTokensArg===undefined ? undefined : Number(maxOutputTokensArg);

if(paid && mode!=='apply') throw new Error('--paid requires --apply.');
if(paid && process.env.SEMANTIC_CLAIM_PILOT_PAID!=='true') throw new Error('Set SEMANTIC_CLAIM_PILOT_PAID=true only after explicit editorial approval.');

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,statement_timeout:20000});
try {
  const report=await runSemanticClaimPilot(pool,{mode,sampleLimit,candidateIds,paid,maxCalls,maxOutputTokens});
  console.log(JSON.stringify({event:'semantic_claim_pilot',...report}));
} finally {await pool.end();}

import pg from 'pg';
import {discoverGoogleTrends, discoverRSS} from '../../packages/discovery/adapters.ts';
import type {DiscoverySource} from '../../packages/discovery/types.ts';

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,statement_timeout:20000});
let failed=false;
try {
  const sources=(await pool.query(`SELECT * FROM discovery_source_registry WHERE enabled=true AND kind IN ('rss','google_trends') ORDER BY kind,name,id`)).rows as DiscoverySource[];
  for(const source of sources) {
    const result=source.kind==='rss' ? await discoverRSS(source) : await discoverGoogleTrends(source);
    const report={source:source.id,kind:source.kind,status:result.status,seen:result.seen,failed:result.failed,errorCode:result.errorCode,limitation:result.limitation};
    console.log(JSON.stringify({event:'discovery_endpoint_validation',...report}));
    if(result.status==='failed' || result.status==='partial') failed=true;
  }
} finally {await pool.end();}
if(failed) process.exitCode=1;

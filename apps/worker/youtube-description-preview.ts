import pg from 'pg';
import {previewYouTubeDescriptions, MAX_YOUTUBE_DESCRIPTION_SCAN, type YouTubeDescriptionCandidate} from '../../packages/claims/youtube-description-preview.ts';

// Read-only metadata analysis. No API calls, migrations, queue updates or verdicts.
// Social text is publisher-authored and does not establish what was said in video.
const argv=process.argv.slice(2);
const invalid=argv.length>1 || (argv.length===1 && !/^--limit=(?:[1-9]|1\d|20)$/.test(argv[0]));
if(invalid) {
  console.error('Usage: node apps/worker/youtube-description-preview.ts [--limit=1..20]');
  process.exit(2);
}
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required.');
const limit=argv.length ? Number(argv[0].slice('--limit='.length)) : 20;
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
try {
  const result=await pool.query(
    `SELECT id,source_kind,source_name,title,summary,original_url,observed_at
     FROM discovery_candidates
     WHERE source_kind='youtube_api'
       AND observed_at >= now()-interval '7 days'
     ORDER BY observed_at DESC,id
     LIMIT $1`,
    [MAX_YOUTUBE_DESCRIPTION_SCAN]
  );
  const rows:YouTubeDescriptionCandidate[]=result.rows.map(row=>({
    id:String(row.id),source_kind:String(row.source_kind),source_name:String(row.source_name),
    title:String(row.title),summary:typeof row.summary==='string'?row.summary:null,
    original_url:String(row.original_url),observed_at:new Date(row.observed_at).toISOString()
  }));
  console.log(JSON.stringify(previewYouTubeDescriptions(rows,{sampleLimit:limit})));
} finally {
  await pool.end();
}

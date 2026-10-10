import pg from 'pg';
import {importAllEnabledSources} from '../../packages/ingestion/rss.ts';

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000
});

try {
  const summary = await importAllEnabledSources(pool);
  console.log(JSON.stringify({event: 'rss_batch_import', ...summary}));
  if(summary.sourcesFailed > 0) process.exitCode = 1;
} catch {
  console.error('RSS batch import failed before source processing.');
  process.exitCode = 1;
} finally {
  await pool.end();
}

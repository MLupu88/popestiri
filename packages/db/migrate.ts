import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(710903)');
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 const sql=await readFile(new URL('./migrations/0001_foundation.sql',import.meta.url),'utf8');
 const digest=createHash('sha256').update(sql).digest('hex');
 const old=await client.query('SELECT checksum FROM schema_migrations WHERE id=$1',['0001']);
 if(old.rowCount){if(old.rows[0].checksum!==digest)throw new Error('Applied migration checksum changed');}
 else {await client.query(sql);await client.query('INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)',['0001',digest]);}
 await client.query('COMMIT');console.log('Migration 0001 applied or already current');
}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}

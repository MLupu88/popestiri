import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
export function database(connectionString:string){
 const pool=new pg.Pool({connectionString,max:4});
 return {db:drizzle(pool),close:()=>pool.end()};
}

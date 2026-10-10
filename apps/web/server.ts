import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {providerConfig} from '../../packages/connectors/contracts.ts';
const token=process.env.OPERATOR_TOKEN;
if(!token||token.length<24)throw new Error('Set OPERATOR_TOKEN (at least 24 characters)');
const server=createServer((req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.url==='/health'&&req.method==='GET'){res.end(JSON.stringify({status:'ok',milestone:'M0.1',databaseChecked:false}));return;}
 const got=Buffer.from(req.headers.authorization??'');const want=Buffer.from(`Bearer ${token}`);
 if(got.length!==want.length||!timingSafeEqual(got,want)){res.writeHead(401);res.end('{"error":"unauthorized"}');return;}
 if(req.url==='/api/providers'&&req.method==='GET'){res.end(JSON.stringify(providerConfig));return;}
 res.writeHead(404);res.end('{"error":"not_implemented"}');
});
server.listen(Number(process.env.PORT??3100),'127.0.0.1',()=>console.log(JSON.stringify({address:server.address()})));

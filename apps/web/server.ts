import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {providerConfig} from '../../packages/connectors/contracts.ts';
import {equal, createSession, validSession, sessionCookie, readSession, csrfToken} from './auth.ts';
import {login, layout, overview, sourcesView, articlesView, discoveriesView, claimRadarView, integrationsView, socialIntakeView, socialIntakeDetailView} from './views.ts';
import {dashboard, listSources, listArticles, listDiscoveries, listClaimLeads, setClaimLeadStatus, addSource, setSourceEnabled, importSource, addSocialSubmission, listSocialIntake, getSocialIntake, setSocialStatus, updateSocialEnrichment, setDiscoveryStatus, socialPlatforms, socialStatuses, discoveryKinds, discoveryStatuses, claimLeadClassifications, claimLeadStatuses, SocialInputError} from './store.ts';

const token = process.env.OPERATOR_TOKEN;
if(!token || token.length<24) throw new Error('Set OPERATOR_TOKEN (at least 24 characters)');
const secret: string = token;
const production = process.env.NODE_ENV === 'production';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:15000});
pool.on('error',()=>console.error('Database pool connection error'));
let attempts = 0, resetAt = Date.now()+15*60*1000;
const importing = new Set<string>();
const messages: Record<string,string> = {added:'Sursa a fost adăugată. Poți importa primele articole.',duplicate:'Acest flux este deja configurat.',updated:'Starea sursei a fost actualizată.',imported:'Import încheiat. Rezultatul apare lângă sursă.',failed:'Importul nu a reușit. Verifică URL-ul fluxului și disponibilitatea sursei HTTPS.',invalid:'Verifică datele introduse și adresa HTTPS Facebook, TikTok sau YouTube.',busy:'Un import este deja în curs. Reîncarcă pagina în câteva secunde.',social_added:'Semnalul social a fost adăugat.',social_duplicate:'Linkul exista deja. Noua proveniență a fost păstrată.',social_updated:'Completarea manuală a fost salvată.',social_status:'Starea editorială a fost actualizată.',discovery_status:'Starea descoperirii a fost actualizată.',claim_status:'Starea afirmației a fost actualizată.'};
function send(res: ServerResponse, code: number, text: string, type='text/html; charset=utf-8') {res.writeHead(code,{'Content-Type':type});res.end(text);}
function json(res: ServerResponse, code: number, value: unknown) {send(res,code,JSON.stringify(value),'application/json; charset=utf-8');}
function redirect(res: ServerResponse, path: string) {res.writeHead(303,{Location:path});res.end();}
async function form(req: IncomingMessage) {
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw new Error('Bad form');
  let text = '';
  for await(const chunk of req) {text += chunk.toString();if(Buffer.byteLength(text)>8192) throw new Error('Form too large');}
  return new URLSearchParams(text);
}
function originOK(req: IncomingMessage) {
  try {const origin = new URL(req.headers.origin ?? '');return ['http:','https:'].includes(origin.protocol) && origin.host===req.headers.host;} catch {return false;}
}
async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const url = new URL(req.url ?? '/', 'http://internal');
  const path = url.pathname;
  const get = req.method==='GET';
  if(path==='/health' && get) {json(res,200,{status:'ok',milestone:'M0.3C.2A',databaseChecked:false});return;}
  if(path==='/ready' && get) {
    try {const result = await pool.query("SELECT id FROM schema_migrations WHERE id='0006'");if(!result.rowCount) throw new Error();json(res,200,{status:'ok',databaseChecked:true});}
    catch {json(res,503,{status:'unavailable',databaseChecked:true});} return;
  }
  if(get && path==='/assets/admin.css') {send(res,200,await readFile(new URL('./public/admin.css',import.meta.url),'utf8'),'text/css; charset=utf-8');return;}
  if(get && path==='/assets/logo') {
    let data: Buffer;let mime='image/png';
    try {data=await readFile(new URL('../../assets/popestiri-logo-white.png',import.meta.url));}
    catch {data=await readFile(new URL('../../assets/popestiri-logo-original.jpeg',import.meta.url));mime='image/jpeg';}
    res.writeHead(200,{'Content-Type':mime});res.end(data);return;
  }
  const session=readSession(req.headers.cookie), authenticated=validSession(session,secret);
  if(get && path==='/') {redirect(res,authenticated?'/admin':'/login');return;}
  if(get && path==='/login') {if(authenticated) redirect(res,'/admin');else send(res,200,login());return;}
  if(req.method==='POST' && path==='/login') {
    if(!originOK(req)) {send(res,403,'Origine neacceptată.');return;}
    if(Date.now()>resetAt) {attempts=0;resetAt=Date.now()+15*60*1000;}
    if(attempts>=20) {res.setHeader('Retry-After',String(Math.ceil((resetAt-Date.now())/1000)));send(res,429,login('Prea multe încercări. Revino în 15 minute.'));return;}
    let data: URLSearchParams;
    try {data=await form(req);} catch {send(res,400,login('Formular invalid.'));return;}
    if(!equal(data.get('token')??'',secret)) {attempts++;send(res,401,login('Cheia de acces nu este corectă.'));return;}
    res.setHeader('Set-Cookie',sessionCookie(createSession(secret),production));redirect(res,'/admin');return;
  }
  if(path.startsWith('/api/')) {
    if(!equal(req.headers.authorization??'',`Bearer ${secret}`)) {json(res,401,{error:'unauthorized'});return;}
    if(path==='/api/providers' && get) {json(res,200,providerConfig);return;}
    json(res,404,{error:'not_implemented'});return;
  }
  if(!authenticated) {if(get) redirect(res,'/login');else send(res,401,'Sesiunea a expirat. Autentifică-te din nou.');return;}
  const csrf=csrfToken(session,secret);
  if(req.method==='POST') {
    if(!originOK(req)) {send(res,403,'Origine neacceptată.');return;}
    let data: URLSearchParams;
    try {data=await form(req);} catch {send(res,400,'Formular invalid.');return;}
    if(!equal(data.get('csrf')??'',csrf)) {send(res,403,'Formular expirat. Reîncarcă pagina.');return;}
    if(path==='/logout') {res.setHeader('Set-Cookie',sessionCookie('',production));redirect(res,'/login');return;}
    if(path==='/admin/sources') {
      let added: boolean;
      try {added=await addSource(pool,(data.get('name')??'').trim(),(data.get('url')??'').trim());}
      catch(error) {if(error instanceof Error && ('code' in error)) throw error;redirect(res,'/admin/sources?notice=invalid');return;}
      redirect(res,`/admin/sources?notice=${added?'added':'duplicate'}`);return;
    }
    if(path==='/admin/social-intake') {
      try {
        const result=await addSocialSubmission(pool,{url:(data.get('url')??'').trim(),submissionSource:data.get('submission_source')??'',claimDescription:data.get('claim_description')??'',investigationReason:data.get('investigation_reason')??''});
        redirect(res,`/admin/social-intake/${encodeURIComponent(result.id)}?notice=${result.duplicate?'social_duplicate':'social_added'}`);
      } catch(error) {if(error instanceof SocialInputError) {redirect(res,'/admin/social-intake?notice=invalid');return;} throw error;}
      return;
    }
    const discoveryMatch=path.match(/^\/admin\/discoveries\/(discovery-[a-f0-9]{32})\/status$/);
    if(discoveryMatch) {
      await setDiscoveryStatus(pool,discoveryMatch[1],data.get('status')??'');
      redirect(res,`/admin/discoveries?notice=discovery_status`);return;
    }
    const claimMatch=path.match(/^\/admin\/claims\/(claim-lead-[a-f0-9]{32})\/status$/);
    if(claimMatch) {
      await setClaimLeadStatus(pool,claimMatch[1],data.get('status')??'');
      redirect(res,'/admin/claims?notice=claim_status');return;
    }
    const socialMatch=path.match(/^\/admin\/social-intake\/(social-[a-f0-9]{32})\/(status|enrichment)$/);
    if(socialMatch) {
      const [,id,action]=socialMatch;
      try {
        if(action==='status') await setSocialStatus(pool,id,data.get('status')??'');
        else await updateSocialEnrichment(pool,id,{claimDescription:data.get('claim_description')??'',investigationReason:data.get('investigation_reason')??'',title:data.get('title')??'',author:data.get('author')??'',publishedAt:data.get('published_at')??'',notes:data.get('notes')??''});
        redirect(res,`/admin/social-intake/${encodeURIComponent(id)}?notice=${action==='status'?'social_status':'social_updated'}`);
      } catch(error) {if(error instanceof SocialInputError) {redirect(res,`/admin/social-intake/${encodeURIComponent(id)}?notice=invalid`);return;} throw error;}
      return;
    }
    const match=path.match(/^\/admin\/sources\/(rss-[a-f0-9]{32})\/(toggle|import)$/);
    if(match) {
      const [,id,action]=match;
      if(action==='toggle') {await setSourceEnabled(pool,id,data.get('enabled')==='true');redirect(res,'/admin/sources?notice=updated');return;}
      if(importing.has(id) || importing.size>=2) {redirect(res,'/admin/sources?notice=busy');return;}
      importing.add(id);
      try {await importSource(pool,id);redirect(res,'/admin/sources?notice=imported');}
      catch {redirect(res,'/admin/sources?notice=failed');} finally {importing.delete(id);}
      return;
    }
    send(res,404,'Acțiune inexistentă.');return;
  }
  if(!get) {res.setHeader('Allow','GET, POST');send(res,405,'Metodă neacceptată.');return;}
  const notice=messages[url.searchParams.get('notice')??'']??'';
  if(path==='/admin') {send(res,200,layout('overview','Ediția zilei','Starea redacției, de la sursele colectate la ziarul pregătit pentru print.',overview(await dashboard(pool)),csrf));return;}
  if(path==='/admin/discoveries') {
    const kind=discoveryKinds.includes((url.searchParams.get('kind')??'') as typeof discoveryKinds[number]) ? url.searchParams.get('kind')! : '';
    const status=discoveryStatuses.includes((url.searchParams.get('status')??'') as typeof discoveryStatuses[number]) ? url.searchParams.get('status')! : '';
    const sort=url.searchParams.get('sort')==='recent'?'recent':'diversified';
    const page=Math.min(10000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
    send(res,200,layout('discoveries','Descoperiri','Inbox editorial cu subiecte provizorii, semnale individuale, proveniență și limitări la vedere.',discoveriesView(await listDiscoveries(pool,kind,status,page,sort),kind,status,csrf,sort),csrf,notice));return;
  }
  if(path==='/admin/claims') {
    const requestedClassification=url.searchParams.has('classification') ? (url.searchParams.get('classification')??'') : 'testable_claim';
    const classification=claimLeadClassifications.includes(requestedClassification as typeof claimLeadClassifications[number]) ? requestedClassification : '';
    const status=claimLeadStatuses.includes((url.searchParams.get('status')??'') as typeof claimLeadStatuses[number]) ? url.searchParams.get('status')! : '';
    const page=Math.min(10000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
    send(res,200,layout('claims','Afirmații în circulație','Afirmații publice care merită investigate, cu textul și limitele observării la vedere.',claimRadarView(await listClaimLeads(pool,classification,status,page),classification,status,csrf),csrf,notice));return;
  }
  if(path==='/admin/sources') {send(res,200,layout('sources','Surse RSS','Alege publicațiile din care colectăm materialul pentru ziar.',sourcesView(await listSources(pool),csrf),csrf,notice));return;}
  if(path==='/admin/articles') {
    const source=(url.searchParams.get('source')??'').slice(0,100);
    const page=Math.min(10000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
    const [articles,sources]=await Promise.all([listArticles(pool,source,page),listSources(pool)]);
    send(res,200,layout('articles','Articole','Materialul colectat din surse, înainte de selecția și verificarea editorială.',articlesView(articles,sources,source,page),csrf));return;
  }
  if(path==='/admin/social-intake') {
    const selectedPlatform=socialPlatforms.includes((url.searchParams.get('platform')??'') as typeof socialPlatforms[number]) ? url.searchParams.get('platform')! : '';
    const selectedStatus=socialStatuses.includes((url.searchParams.get('status')??'') as typeof socialStatuses[number]) ? url.searchParams.get('status')! : '';
    const page=Math.min(10000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
    send(res,200,layout('social-intake','Social Intake','Linkuri publice trimise de operatori, păstrate ca neconfirmate până la verificarea editorială.',socialIntakeView(await listSocialIntake(pool,selectedPlatform,selectedStatus,page),selectedPlatform,selectedStatus,csrf),csrf,notice));return;
  }
  const socialDetail=path.match(/^\/admin\/social-intake\/(social-[a-f0-9]{32})$/);
  if(socialDetail) {
    const detail=await getSocialIntake(pool,socialDetail[1]);
    if(!detail){send(res,404,'Semnalul social nu există.');return;}
    send(res,200,layout('social-intake','Detaliu Social Intake','Revizuiește proveniența, completează metadata disponibilă manual și schimbă starea editorială.',socialIntakeDetailView(detail,csrf),csrf,notice));return;
  }
  if(path==='/admin/integrations') {send(res,200,layout('integrations','Integrări','Serviciile care vor susține colectarea, verificarea și redactarea.',integrationsView(providerConfig),csrf));return;}
  send(res,404,'Pagina nu există.');
}
const server=createServer((req,res)=>{handler(req,res).catch(()=>{
  console.error('Request failed:',req.method,(req.url??'').split('?')[0]);
  if(!res.headersSent) send(res,503,'Serviciul este temporar indisponibil. Verifică baza de date și migrările.');else res.end();
});});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT??3100),process.env.HOST??'127.0.0.1',()=>{const address=server.address();console.log(JSON.stringify({address,localURL:address && typeof address!=='string'?`http://127.0.0.1:${address.port}`:null}));});
for(const signal of ['SIGTERM','SIGINT'] as const) process.once(signal,()=>server.close(()=>{void pool.end();}));

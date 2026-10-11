import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createSession} from '../apps/web/auth.ts';

test('HTTP login, CSRF, protected routes and logout work with browser cookies',async()=>{
 const secret='http-test-secret-32-characters-long';
 const child=spawn(process.execPath,['apps/web/server.ts'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',OPERATOR_TOKEN:secret,NODE_ENV:'test',DATABASE_URL:'postgresql://test:test@127.0.0.1:1/test'},stdio:['ignore','pipe','pipe']});
 const base=await new Promise<string>((resolve,reject)=>{
  let out='';const timeout=setTimeout(()=>{child.kill();reject(new Error('Server startup timed out'));},10000);
  child.stdout.on('data',data=>{out+=data.toString();if(out.includes('\n')) {try{const info=JSON.parse(out.trim());clearTimeout(timeout);resolve(`http://127.0.0.1:${info.address.port}`);}catch{}}});
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code}`));});
 });
 try {
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await fetch(base+'/ready')).status,503);
  const home=await fetch(base+'/',{redirect:'manual'});assert.equal(home.status,303);assert.equal(home.headers.get('location'),'/login');
  assert.equal((await fetch(base+'/api/providers')).status,401);
  assert.equal((await fetch(base+'/api/providers',{headers:{Authorization:`Bearer ${secret}`}})).status,200);
  const send=(path:string,body:Record<string,string>,cookie='',origin=base)=>fetch(base+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Cookie:cookie},body:new URLSearchParams(body)});
  assert.equal((await send('/login',{token:secret},'','https://evil.example')).status,403);
  assert.equal((await send('/login',{token:'incorrect'})).status,401);
  const auth=await send('/login',{token:secret});assert.equal(auth.status,303);
  const cookie=auth.headers.get('set-cookie')!.split(';')[0];assert.ok(cookie);assert.ok(!cookie.includes(secret));
  const screen=await fetch(base+'/admin/integrations',{headers:{Cookie:cookie}});assert.equal(screen.status,200);
  const html=await screen.text();const csrf=html.match(/name="csrf" value="([^"]+)"/)![1];
  const invalidSocial=await send('/admin/social-intake',{csrf,url:'https://example.com/not-supported',submission_source:'Redacție',claim_description:'Afirmație',investigation_reason:'Motiv'},cookie);
  assert.equal(invalidSocial.status,303);assert.equal(invalidSocial.headers.get('location'),'/admin/social-intake?notice=invalid');
  const socialInfrastructure=await send('/admin/social-intake',{csrf,url:'https://youtube.com/watch?v=video-1',submission_source:'Redacție',claim_description:'Afirmație',investigation_reason:'Motiv'},cookie);
  assert.equal(socialInfrastructure.status,503);const infrastructureBody=await socialInfrastructure.text();assert.match(infrastructureBody,/Serviciul este temporar indisponibil/);assert.doesNotMatch(infrastructureBody,/ECONNREFUSED|postgresql|DATABASE_URL/);
  assert.equal((await send('/logout',{},cookie)).status,403);
  const other=`popestiri_session=${createSession(secret)}`;
  assert.equal((await send('/logout',{csrf},other)).status,403);
  const logout=await send('/logout',{csrf},cookie);assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie')!,/Max-Age=0/);
  const logo=await fetch(base+'/assets/logo');assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');
 } finally {child.kill();await once(child,'exit');}
});

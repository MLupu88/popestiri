import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {XMLParser, XMLValidator} from 'fast-xml-parser';

export function publicIPv4(address: string): boolean {
  if(isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
export function feedURL(value: string) {
  const url = new URL(value);
  if(url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') ||
    url.hostname.startsWith('[') || (isIP(url.hostname) && !publicIPv4(url.hostname))) {
    throw new Error('Folosește un flux HTTPS public, fără credențiale sau port personalizat.');
  }
  url.hash = '';
  return url;
}
// Resolve and pin each connection, including redirects; never request private addresses.
export async function downloadFeed(value: string, signal = AbortSignal.timeout(15000), redirects = 0): Promise<{xml: string; url: string}> {
  const url = feedURL(value);
  const addresses = isIP(url.hostname) ? [url.hostname] : await Promise.race([
    lookup(url.hostname, {all:true,family:4}).then(results=>results.map(result=>result.address)),
    new Promise<never>((_,reject) => {
      if(signal.aborted) reject(new Error('Importul a depășit timpul disponibil.'));
      else signal.addEventListener('abort',()=>reject(new Error('Importul a depășit timpul disponibil.')), {once:true});
    })
  ]);
  if(!addresses.length || addresses.some(ip => !publicIPv4(ip))) throw new Error('Adresa sursei nu este publică.');
  const address = addresses[0];
  return new Promise((resolve,reject) => {
    const request = https.get(url, {
      signal, agent: false, family: 4,
      lookup: (_host, options, callback) => options.all ? callback(null, [{address, family:4}]) : callback(null, address, 4),
      headers: {'User-Agent':'PopeStiri/0.2 RSS reader', Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml', 'Accept-Encoding':'identity'}
    }, response => {
      const status = response.statusCode ?? 0;
      if([301,302,303,307,308].includes(status)) {
        response.resume();
        if(redirects >= 3 || !response.headers.location) {reject(new Error('Prea multe redirecționări.')); return;}
        try {resolve(downloadFeed(new URL(response.headers.location,url).href, signal, redirects + 1));} catch(error) {reject(error);}
        return;
      }
      if(status !== 200) {response.resume();reject(new Error(`Sursa a răspuns HTTP ${status}.`));return;}
      if(response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy();reject(new Error('Sursa a trimis un format comprimat neacceptat.'));return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if(size > 2 * 1024 * 1024) {response.destroy(new Error('Fluxul depășește limita de 2 MB.'));return;}
        chunks.push(chunk);
      });
      response.on('end',()=>resolve({xml:Buffer.concat(chunks).toString('utf8'),url:url.href}));
      response.on('error',reject);
    });
    request.on('error',reject);
  });
}
const array = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const string = (value: any): string => typeof value === 'string' ? value : typeof value?.['#text'] === 'string' ? value['#text'] : '';
function plain(value: any, max: number) {
  return string(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function link(value: string, base: string) {
  try {const url = new URL(value,base);if(!value || !['http:','https:'].includes(url.protocol) || url.username || url.password) return null;url.hash='';return url.href;} catch {return null;}
}
export type FeedItem = {url: string; title: string; excerpt: string; publishedAt: string | null; photo: {url: string; sourceURL: string; rightsStatus: 'unknown'} | null};
export function parseFeed(xml: string, base: string): FeedItem[] {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Declarațiile DTD și entity nu sunt acceptate.');
  if(XMLValidator.validate(xml) !== true) throw new Error('Sursa nu conține XML valid.');
  const parsed = new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:true}).parse(xml);
  const atom = Boolean(parsed.feed);
  if(!parsed.rss?.channel && !parsed.feed && !parsed['rdf:RDF']) throw new Error('Sursa nu este un flux RSS sau Atom.');
  const entries = array(atom ? parsed.feed.entry : parsed.rss?.channel?.item ?? parsed['rdf:RDF']?.item);
  const output: FeedItem[] = [];const seen = new Set<string>();
  for(const entry of entries.slice(0,200)) {
    const rawLink = atom ? array(entry.link).find(l => !l['@_rel'] || l['@_rel']==='alternate')?.['@_href'] : string(entry.link);
    const url = link(rawLink ?? '',base), title = plain(entry.title,400);
    if(!url || !title || seen.has(url)) continue;
    seen.add(url);
    const media = [...array(entry['media:content']),...array(entry['media:thumbnail']),...array(entry['media:group']?.['media:content']),...array(entry.enclosure)]
      .find(m=>m?.['@_url'] && (String(m['@_type']??'').startsWith('image/') || m['@_medium']==='image' || (!m['@_type'] && /\.(jpe?g|png|webp)(\?|$)/i.test(m['@_url']))));
    const photoURL = media ? link(media['@_url'],base) : null;
    const date = new Date(string(entry.pubDate ?? entry.published ?? entry.updated ?? entry['dc:date']));
    output.push({url,title,excerpt:plain(entry.description ?? entry.summary ?? entry['content:encoded'] ?? entry.content,1500),publishedAt:Number.isFinite(date.getTime())?date.toISOString():null,
      photo:photoURL?{url:photoURL,sourceURL:url,rightsStatus:'unknown'}:null});
    if(output.length===100) break;
  }
  return output;
}

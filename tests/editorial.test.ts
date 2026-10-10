import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Article} from '../packages/core/contracts.ts';
import {articleIssues,bucharestDate,editionIssues} from '../packages/core/policy.ts';
import {composeEdition} from '../apps/worker/pipeline.ts';
import {printReadiness} from '../packages/newspaper/contracts.ts';
import {cupsArguments,spoolIdentity} from '../apps/print-agent/contracts.ts';
const fixture=JSON.parse(await readFile(new URL('../fixtures/article.json',import.meta.url),'utf8'));
function article(){return Article.parse(structuredClone(fixture));}
test('fixture with unapproved photo is blocked, never silently published',()=>{
 const e=composeEdition([article()],new Date('2026-10-09T03:00:00Z'),'fixture');
 assert.equal(e.status,'blocked');assert.ok(editionIssues(e).includes('fixture-article-1:photo_rights_not_approved'));
});
test('selecting an article does not alter its verdict',()=>{
 const a=article();a.photo.rights='approved';
 const e=composeEdition([a],new Date('2026-10-09T03:00:00Z'),'fixture');
 assert.equal(e.status,'validated');assert.equal(e.articles[0].verifications[0].verdict,'NECONFIRMAT');
});
test('conclusive verdict without evidence is rejected',()=>{
 const a=article();a.verifications[0].verdict='CONFIRMAT';assert.ok(articleIssues(a).includes('verdict_without_evidence:fixture-claim'));
});
test('sensitive conclusive claims require primary evidence and independent provenance',()=>{
 const a=article();a.photo.rights='approved';a.claims[0].sensitive=true;a.verifications[0].verdict='CONFIRMAT';
 a.evidence=[{id:'e1',claimId:'fixture-claim',url:'https://example.org/one',publisher:'Institution',independenceGroup:'institution',excerpt:'Fixture',tier:1,relation:'supports',retrievedAt:'2026-10-09T03:00:00Z'}];
 a.verifications[0].evidenceIds=['e1'];assert.ok(articleIssues(a).includes('sensitive_evidence_insufficient:fixture-claim'));
 a.evidence.push({...a.evidence[0],id:'e2',url:'https://example.org/two',publisher:'Independent newsroom',independenceGroup:'newsroom',tier:2});a.verifications[0].evidenceIds.push('e2');
 assert.deepEqual(articleIssues(a),[]);
});
test('evidence from a different claim cannot justify verdict',()=>{
 const a=article();a.verifications[0].evidenceIds=['e'];a.evidence=[{id:'e',claimId:'another',url:'https://example.org',publisher:'Fixture',excerpt:'Fixture',tier:1,relation:'supports',retrievedAt:'2026-10-09T03:00:00Z'}];
 assert.ok(articleIssues(a).includes('broken_evidence_reference:fixture-claim'));
});
test('duplicate events cannot occupy two article slots',()=>{
 const a=article();const b=article();b.id='second';assert.ok(editionIssues(composeEdition([a,b],new Date(),'fixture')).includes('duplicate_cluster'));
});
test('Bucharest date follows summer and winter offsets',()=>{
 assert.equal(bucharestDate(new Date('2026-07-01T21:30:00Z')),'2026-07-02');
 assert.equal(bucharestDate(new Date('2026-12-01T21:30:00Z')),'2026-12-01');
});
test('PDF with 5 pages is not printable',()=>{
 assert.ok(printReadiness({pdfPath:'x.pdf',sha256:'a'.repeat(64),pageCount:5,issues:[]}).includes('invalid_page_count'));
});
test('retry uses same print identity; explicit reprint is separate',()=>{
 const r={editionId:'e',pdfSha256:'abc',requestId:'first',printer:'Office',copies:1,duplex:true};
 assert.equal(spoolIdentity(r),spoolIdentity({...r}));assert.notEqual(spoolIdentity(r),spoolIdentity({...r,requestId:'reprint-1'}));
 assert.deepEqual(cupsArguments(r,'/tmp/edition.pdf').slice(-2),['--','/tmp/edition.pdf']);
});

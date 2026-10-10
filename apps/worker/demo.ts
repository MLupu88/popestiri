import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Article} from '../../packages/core/contracts.ts';
import {composeEdition} from './pipeline.ts';
import {editionIssues} from '../../packages/core/policy.ts';
const fixture=JSON.parse(await readFile(new URL('../../fixtures/article.json',import.meta.url),'utf8'));
const edition=composeEdition([Article.parse(fixture)],new Date('2026-10-09T03:15:00Z'),'fixture');
await mkdir(new URL('../../output/',import.meta.url),{recursive:true});
await writeFile(new URL('../../output/edition.fixture.json',import.meta.url),JSON.stringify({edition,issues:editionIssues(edition)},null,2));
console.log(JSON.stringify({id:edition.id,status:edition.status,mode:edition.mode,pdfGenerated:false,printerCalled:false}));

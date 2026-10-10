import type { Article, Edition } from './contracts.ts';

// Initial explicit policy, not a learned truth score. Editorial thresholds are configurable later.
export function articleIssues(article: Article): string[] {
  const issues:string[]=[];
  if(article.photo.rights!=='approved') issues.push('photo_rights_not_approved');
  if(!article.factualClaimsReviewed) issues.push('claims_not_reviewed');
  if(article.verificationRequired && !article.claims.length) issues.push('required_claim_missing');
  for(const claim of article.claims){
    const v=article.verifications.find(v=>v.claimId===claim.id);
    if(!v){issues.push(`missing_verification:${claim.id}`);continue;}
    if(v.reviewStatus==='proposed') issues.push(`unaccepted_verification:${claim.id}`);
    const evidence=v.evidenceIds.map(id=>article.evidence.find(e=>e.id===id&&e.claimId===claim.id));
    if(evidence.some(e=>!e)) issues.push(`broken_evidence_reference:${claim.id}`);
    if(v.verdict!=='NECONFIRMAT'&&v.verdict!=='NU ESTE O AFIRMAȚIE VERIFICABILĂ'&&!evidence.length) issues.push(`verdict_without_evidence:${claim.id}`);
    // Initial evidence threshold. Independence groups must come from source provenance, not URL count.
    if(claim.sensitive&&!['NECONFIRMAT','NU ESTE O AFIRMAȚIE VERIFICABILĂ'].includes(v.verdict)){
      const groups=new Set(evidence.filter(e=>e?.independenceGroup).map(e=>e!.independenceGroup));
      if(!evidence.some(e=>e?.tier===1)||groups.size<2)issues.push(`sensitive_evidence_insufficient:${claim.id}`);
    }
  }
  if(article.verifications.some(v=>!article.claims.some(c=>c.id===v.claimId)))issues.push('orphan_verification');
  if(article.section==='FLASH GLOBAL'){
    const n=article.body.trim().split(/\s+/u).length;
    if(n<40||n>60) issues.push('flash_length_outside_40_60');
  }
  return issues;
}
export function editionIssues(edition:Edition): string[]{
  const issues=edition.articles.flatMap(a=>articleIssues(a).map(x=>`${a.id}:${x}`));
  if(!edition.articles.length)issues.push('empty_edition');
  if(new Set(edition.articles.map(a=>a.clusterId)).size!==edition.articles.length)issues.push('duplicate_cluster');
  return issues;
}
export function bucharestDate(now:Date):string{
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=(name:string)=>p.find(x=>x.type===name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

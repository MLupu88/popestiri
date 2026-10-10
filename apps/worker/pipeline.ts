import { Edition, type Article } from '../../packages/core/contracts.ts';
import { bucharestDate,editionIssues } from '../../packages/core/policy.ts';
export function composeEdition(articles:Article[],now:Date,mode:'fixture'|'live'):Edition{
  const date=bucharestDate(now);
  const draft=Edition.parse({id:`${mode}-${date}`,date,timezone:'Europe/Bucharest',mode,status:'draft',maxPages:4,articles,createdAt:now.toISOString()});
  draft.status=editionIssues(draft).length?'blocked':'validated';
  // Validated is NOT ready. Rendered PDF + preflight are required before ready/printing.
  return draft;
}

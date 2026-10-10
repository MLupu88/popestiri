import type { Edition } from '../core/contracts.ts';
export interface RenderResult {pdfPath:string;sha256:string;pageCount:number;issues:string[]}
export interface PdfRenderer {render(edition:Edition):Promise<RenderResult>}
export function printReadiness(result:RenderResult):string[]{
 return [...result.issues,...(!Number.isInteger(result.pageCount)||result.pageCount<1||result.pageCount>4?['invalid_page_count']:[]),...(!/^[a-f0-9]{64}$/.test(result.sha256)?['missing_pdf_checksum']:[])];
}
export const printSpec={widthMm:210,heightMm:297,maxPages:4,marginsMm:12,columns:3,bodyPt:10.5,photoRequired:true,minEffectiveDpi:200,targetDpi:300} as const;

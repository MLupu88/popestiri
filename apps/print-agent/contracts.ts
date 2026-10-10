export interface PrintRequest {editionId:string;pdfSha256:string;requestId:string;printer:string;copies:number;duplex:boolean}
export function spoolIdentity(request:PrintRequest):string{
  // A reprint MUST use a new explicit requestId. A retry reuses this identity.
  return `${request.editionId}:${request.requestId}`;
}
export function cupsArguments(request:PrintRequest,path:string):string[]{
  if(!Number.isInteger(request.copies)||request.copies<1||request.copies>10)throw new Error('Invalid copies');
  if(!request.printer.trim())throw new Error('Printer required');
  return ['-d',request.printer,'-n',String(request.copies),'-o','media=A4','-o',`sides=${request.duplex?'two-sided-long-edge':'one-sided'}`,'--',path];
}
// Runtime submission is intentionally not implemented here. CUPS acceptance is not physical printing.
// On a crash between spool submission and acknowledgement, reconcile jobId before any retry.

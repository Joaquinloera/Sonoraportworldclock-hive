/**
 * KINO #281102 — real, bounded, credential-free public-document SWARM runner.
 * Performs GET requests only to explicitly approved official HTTPS hosts.
 * Runs deterministic research assignments for the existing 144 logical agent roles;
 * it does not instantiate 144 hosted LLM agents or authenticate to any bank.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const SKIM_ROLES=Object.freeze(['DISCOVERY','API_AUTH_SKIM','SDK_ENDPOINT_SKIM','SECURITY_PERMISSIONS','CROSS_CHECK_EVIDENCE','INTEGRATION_TEST']);
const SIGNALS=Object.freeze({
 DISCOVERY:['bank','payments','payment','financial','system','institution','provider'],
 API_AUTH_SKIM:['oauth','certificate','authentication','authorization','api key','client id','mtls','token','developer','credential'],
 SDK_ENDPOINT_SKIM:['endpoint','api','sdk','rest','webhook','sandbox','integration'],
 SECURITY_PERMISSIONS:['access','participant','permission','security','approval','licensed','consent','onboard','eligible'],
 CROSS_CHECK_EVIDENCE:['documentation','rule','guide','requirements','policy','developer','participant'],
 INTEGRATION_TEST:['sandbox','test environment','simulation','testing','certification']
});
const LIMIT_BYTES=1_500_000;
const HOST_RE=/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SAFE_ID=/^[a-z0-9._:-]{2,110}$/i;
const BAD_URL_KEYS=/token|key|secret|password|auth|credential|session|signature/i;
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function officialUrl(value,allowedHosts){
 if(typeof value!=='string'||value.length>1600)throw Error('INVALID_PUBLIC_SOURCE_URL');
 let u;try{u=new URL(value);}catch{throw Error('INVALID_PUBLIC_SOURCE_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!HOST_RE.test(u.hostname)||!allowedHosts.has(u.hostname.toLowerCase())||
  [...u.searchParams.keys()].some(x=>BAD_URL_KEYS.test(x)))throw Error('INVALID_PUBLIC_SOURCE_URL');
 return u.href;
}
function normalizeHtml(source){
 return source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi,' ')
  .replace(/\s+/g,' ').trim().slice(0,200_000).toLowerCase();
}
function redactString(s){return String(s??'').slice(0,160).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/(?:sk_(?:live|test)_[\w-]+|bearer\s+[\w.-]+|\b\d{13,19}\b)/gi,'[REDACTED]');}
export function validatePublicSwarmManifest(roster,manifest){
 if(!roster||!Array.isArray(roster.agents)||roster.agents.length!==144||!Array.isArray(roster.regionalLanes)||roster.regionalLanes.length!==19)throw Error('INVALID_144_AGENT_ROSTER');
 if(!manifest||manifest.mode!=='PUBLIC_DOCUMENT_RESEARCH_ONLY'||manifest.productionBankingEnabled!==false||manifest.hostedAgentClaims!==false||!Array.isArray(manifest.jobs)||manifest.jobs.length<1||manifest.jobs.length>24||!Array.isArray(manifest.allowedHosts))throw Error('INVALID_SWARM_MANIFEST');
 const known=new Set(roster.regionalLanes.map(x=>x.id));
 const allowed=new Set(manifest.allowedHosts);
 if(!allowed.size||allowed.size>30||[...allowed].some(h=>!HOST_RE.test(h)||h==='localhost'||h.endsWith('.internal')||h.endsWith('.local')))throw Error('INVALID_PUBLIC_HOST_ALLOWLIST');
 const ids=new Set();
 for(const job of manifest.jobs){
  if(!SAFE_ID.test(job?.id)||ids.has(job.id)||!known.has(job.lane)||typeof job.provider!=='string'||job.provider.length>140||!job.provider.trim())throw Error('INVALID_PUBLIC_RESEARCH_JOB');
  ids.add(job.id);officialUrl(job.url,allowed);
  const assigned=roster.agents.filter(x=>x.lane===job.lane&&SKIM_ROLES.includes(x.workerRole));
  if(assigned.length!==6||new Set(assigned.map(x=>x.workerRole)).size!==6||assigned.some(x=>x.financialTransferPermission!==false))throw Error('REGIONAL_AGENT_ASSIGNMENTS_UNVERIFIED');
 }
 return {approvedJobs:ids.size,lanes:new Set(manifest.jobs.map(x=>x.lane)).size,agentRolesDefined:roster.agents.length};
}
async function fetchDocument(url,fetchImpl,timeoutMs){
 let response;
 try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'text/html, text/plain;q=0.9','User-Agent':'SonoraPort-ResearchVerifier/1.0 (public documentation; no authentication)'},signal:AbortSignal.timeout(timeoutMs)});}catch{return {status:'FETCH_FAILED',reason:'OFFICIAL_SOURCE_UNREACHABLE'};}
 if(!response?.ok)return {status:'FETCH_FAILED',reason:'OFFICIAL_SOURCE_HTTP_ERROR',httpStatus:Number(response?.status)||null};
 const type=(response.headers?.get?.('content-type')||'').toLowerCase();
 if(!/^(text\/html|text\/plain|application\/xhtml\+xml)/.test(type))return {status:'FETCH_FAILED',reason:'DOCUMENT_CONTENT_TYPE_UNSUPPORTED'};
 let parts=[],length=0;
 try{
  if(response.body?.getReader){const reader=response.body.getReader();while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>LIMIT_BYTES){try{await reader.cancel();}catch{}return {status:'FETCH_FAILED',reason:'DOCUMENT_OVERSIZE'};}parts.push(Buffer.from(value));}}
  else {const text=await response.text();const b=Buffer.from(text,'utf8');if(b.length>LIMIT_BYTES)return {status:'FETCH_FAILED',reason:'DOCUMENT_OVERSIZE'};parts=[b];length=b.length;}
 }catch{return {status:'FETCH_FAILED',reason:'DOCUMENT_READ_FAILED'};}
 const bytes=Buffer.concat(parts);const plain=normalizeHtml(bytes.toString('utf8'));
 if(plain.length<160)return {status:'FETCH_FAILED',reason:'DOCUMENT_NOT_SUBSTANTIVE'};
 return {status:'FETCHED_DOCUMENT',contentBytes:length,sourceSha256:sha256(bytes),plain};
}
/** Safely executes a finite, parallel source check. These are tool-worker assignments, not hosted LLM agents. */
export async function runPublicDocumentSwarm({roster,manifest,fetchImpl=fetch,maxConcurrent=4,timeoutMs=18000}){
 const approved=validatePublicSwarmManifest(roster,manifest);
 if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)throw Error('CONCURRENCY_BOUND_REQUIRED');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error('TIMEOUT_BOUND_REQUIRED');
 if(typeof fetchImpl!=='function')throw Error('FETCH_TRANSPORT_REQUIRED');
 const receipts=new Array(manifest.jobs.length);let index=0,active=0,maxObserved=0;
 async function worker(){
  for(;;){const i=index++;if(i>=manifest.jobs.length)return;const job=manifest.jobs[i];active++;maxObserved=Math.max(maxObserved,active);
   try{
    const page=await fetchDocument(job.url,fetchImpl,timeoutMs);
    const roles=roster.agents.filter(a=>a.lane===job.lane&&SKIM_ROLES.includes(a.workerRole));
    const stages=roles.map(a=>{const signals=page.plain?SIGNALS[a.workerRole].filter(s=>page.plain.includes(s)):[];
      return {agentRoleId:a.id,stage:a.workerRole,keywordSignals:signals,
       conclusion:a.workerRole==='INTEGRATION_TEST'?'NO_SANDBOX_TEST_RUN':a.workerRole==='CROSS_CHECK_EVIDENCE'?'SINGLE_PUBLIC_SOURCE_NOT_INDEPENDENT_AUTHORIZATION':page.status==='FETCHED_DOCUMENT'?'DOCUMENT_KEYWORD_EXTRACTION':'NOT_VERIFIED'};
    });
    const valid=page.status==='FETCHED_DOCUMENT';receipts[i]={jobId:job.id,lane:job.lane,provider:redactString(job.provider),sourceUrl:job.url,
     status:page.status,reason:page.reason??null,httpStatus:page.httpStatus??null,
     fetchedDocumentSha256:valid?page.sourceSha256:null,contentBytes:valid?page.contentBytes:0,
     stages,liveBankingConnection:false,credentialsPossessed:false,sandboxTestPerformed:false,hostedLLMAgentExecuted:false};
   }catch{receipts[i]={jobId:job.id,lane:job.lane,status:'FETCH_FAILED',reason:'RESEARCH_EXECUTION_ERROR',liveBankingConnection:false,credentialsPossessed:false,hostedLLMAgentExecuted:false};}
   finally{active--;}
  }
 }
 await Promise.all(Array.from({length:Math.min(maxConcurrent,manifest.jobs.length)},()=>worker()));
 const succeeded=receipts.filter(r=>r.status==='FETCHED_DOCUMENT').length;
 return {schemaVersion:'1.0.0',program:'SONORAPORT_KINO_PUBLIC_SWARM',runType:'REAL_EXTERNAL_PUBLIC_DOC_FETCH_WHEN_EXECUTED',
  executionUtc:new Date().toISOString(),approval:approved,requestsAttempted:receipts.length,documentsFetched:succeeded,documentsBlocked:receipts.length-succeeded,
  maxConcurrentObserved:maxObserved,logicalAgentRolesDefined:144,independentHostedLLMAgentsVerified:0,bankApiCredentialsUsed:false,paymentsInitiated:0,
  officialDocumentReceipts:receipts};
}
const isCLI=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isCLI){
 const [rosterPath,manifestPath,outPath,flag]=process.argv.slice(2);
 if(flag!=='--fetch-approved-public-docs'||!rosterPath||!manifestPath||!outPath){console.error('Usage: node public-document-swarm.mjs <roster> <manifest> <new-output> --fetch-approved-public-docs');process.exitCode=2;}
 else{
  try{const roster=JSON.parse(readFileSync(rosterPath,'utf8'));const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
   const result=await runPublicDocumentSwarm({roster,manifest});writeFileSync(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({mode:result.runType,attempted:result.requestsAttempted,officialDocumentsFetched:result.documentsFetched,failed:result.documentsBlocked,maxConcurrentObserved:result.maxConcurrentObserved,hostedAgentsVerified:0,outputPath:outPath}));
   if(!result.documentsFetched)process.exitCode=1;
  }catch{console.error('KINO_PUBLIC_RESEARCH_BLOCKED');process.exitCode=1;}
 }
}

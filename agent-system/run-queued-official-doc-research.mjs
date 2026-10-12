/**
 * KINO #281102 — bounded, one-job-at-a-time research queue worker (Node 22+).
 * Validates every leased task against the approved, source-verified manifest
 * before a network fetch. No transfer, financial account, or secret operations.
 *
 * The migration is separate. This service does not apply DDL, provision funds,
 * read financial account tables, or enable production banking APIs.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {ResearchEngine,RESEARCH_STAGES} from './research-engine.mjs';
import {SupabaseResearchQueue} from './supabase-job-store.mjs';
import {TinyFishDocumentClient,makeOfficialDocumentAdapters,bindDocumentResearchRoster} from './tinyfish-research-adapter.mjs';

const ID=/^[a-zA-Z0-9._:-]{1,120}$/;
const WORKER=/^[a-zA-Z0-9._:-]{1,100}$/;
const VALID_INTENTS=new Set(['PUBLIC_RESEARCH']);
function safeErrorCode(e){
  const safe=new Set(['UNKNOWN_TASK','TASK_SOURCE_MISMATCH','TASK_LANE_MISMATCH','INVALID_APPROVED_MANIFEST','INVALID_QUEUE_CLAIM']);
  return safe.has(e?.message)?e.message:'QUEUE_WORKER_EXECUTION_FAILED';
}
function canonicalUrls(urls){
  return Array.isArray(urls)?[...urls].sort():[];
}
function sameUrls(a,b){return JSON.stringify(canonicalUrls(a))===JSON.stringify(canonicalUrls(b));}
export function validateQueuedResearchManifest(roster,manifest){
  if(!roster||!Array.isArray(roster.agents)||roster.agents.length!==144||!Array.isArray(roster.regionalLanes)||roster.regionalLanes.length!==19)throw Error('INVALID_APPROVED_MANIFEST');
  if(!manifest||!Array.isArray(manifest.jobs)||!Array.isArray(manifest.allowedHosts)||!Array.isArray(manifest.coverage))throw Error('INVALID_APPROVED_MANIFEST');
  const known=new Set(roster.regionalLanes.map(x=>x.id));
  const allowed=new Set(manifest.allowedHosts);
  if(!known.size||manifest.jobs.length<1||!allowed.size||allowed.size>30||new Set(manifest.jobs.map(x=>x.id)).size!==manifest.jobs.length)throw Error('INVALID_APPROVED_MANIFEST');
  for(const j of manifest.jobs){
    if(!ID.test(j.id??'')||!known.has(j.lane)||typeof j.provider!=='string'||j.provider.length<1||j.provider.length>160
       ||!Array.isArray(j.sourceUrls)||j.sourceUrls.length<2||j.sourceUrls.length>10
       ||new Set(j.sourceUrls).size!==j.sourceUrls.length)throw Error('INVALID_APPROVED_MANIFEST');
    for(const u of j.sourceUrls){
      let url;try{url=new URL(u)}catch{throw Error('INVALID_APPROVED_MANIFEST');}
      if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.username||url.password||url.port||url.hash
         ||[...url.searchParams.keys()].some(k=>/password|secret|token|key|auth|credential|session|signature/i.test(k)))throw Error('INVALID_APPROVED_MANIFEST');
    }
    const entry=manifest.coverage.find(x=>x.lane===j.lane);
    if(!entry||entry.sourceVerificationStatus!=='TWO_OFFICIAL_DOCS_FETCHED'||!sameUrls(entry.sourceUrls,j.sourceUrls))throw Error('INVALID_APPROVED_MANIFEST');
  }
  if(new Set(manifest.coverage.map(x=>x.lane)).size!==19||manifest.coverage.some(x=>!known.has(x.lane)))throw Error('INVALID_APPROVED_MANIFEST');
  return {logicalAgents:roster.agents.length,regionalLanes:known.size,approvedPublicResearchJobs:manifest.jobs.length,
    pendingRegionalLanes:manifest.coverage.length-manifest.jobs.length,productionBankConnections:0};
}
export function authorizeClaim(claim,manifest){
  if(!claim||!claim.id||!claim.lease_token||!ID.test(claim.task_key??''))throw Error('INVALID_QUEUE_CLAIM');
  const j=manifest.jobs.find(x=>x.id===claim.task_key);
  if(!j)throw Error('UNKNOWN_TASK');
  if(j.lane!==claim.lane||j.provider!==claim.provider||!VALID_INTENTS.has(claim.intent))throw Error('TASK_LANE_MISMATCH');
  if(!sameUrls(j.sourceUrls,claim.source_urls))throw Error('TASK_SOURCE_MISMATCH');
  return {id:j.id,lane:j.lane,provider:j.provider,sourceUrls:[...j.sourceUrls],intent:'PUBLIC_RESEARCH'};
}

/** One claim and one research job; no infinite polling, payment or credential retrieval. */
export async function runOneAuthorizedQueuedResearchJob({queue,roster,manifest,tinyfishApiKey,fetchImpl,workerName='KINO-281102-RESEARCH'}){
  const info=validateQueuedResearchManifest(roster,manifest);
  if(!WORKER.test(workerName))throw Error('INVALID_WORKER_NAME');
  if(!queue||typeof queue.claim!=='function'||typeof queue.finish!=='function'||typeof queue.appendReceipt!=='function')throw Error('INVALID_QUEUE');
  // Check the document connector config before claiming; avoid stranded leases when key is absent.
  const client=new TinyFishDocumentClient({apiKey:tinyfishApiKey,fetchImpl,allowedHosts:manifest.allowedHosts});
  const claim=await queue.claim(workerName);
  if(!claim)return {state:'NO_JOB_AVAILABLE',...info};
  let job;
  try{job=authorizeClaim(claim,manifest);}catch(e){
    const reason=safeErrorCode(e);
    const accepted=await queue.finish(claim,{jobId:claim.task_key,lane:claim.lane,provider:claim.provider,status:'BLOCKED',reason,outputs:{}});
    if(accepted!==true)throw Error('JOB_LEASE_NO_LONGER_VALID');
    return {state:'BLOCKED_UNAUTHORIZED_TASK',jobId:claim.task_key,reason,bankingTransfersInitiated:0,hostedAIAgentsDeployed:0};
  }
  const bound=bindDocumentResearchRoster(roster,[job.lane]);
  const engine=new ResearchEngine({roster:bound,adapters:makeOfficialDocumentAdapters(client),maxParallel:1});
  const result=await engine.run(job);
  // If receipt writing fails, do not finalize. The lease expires for controlled retry.
  for(const receipt of engine.receipts.filter(x=>x.jobId===job.id))await queue.appendReceipt(claim,receipt);
  const accepted=await queue.finish(claim,result);
  if(accepted!==true)throw Error('JOB_LEASE_NO_LONGER_VALID');
  return {state:'JOB_COMPLETE',jobId:job.id,lane:job.lane,status:result.status,
    stageCount:Object.keys(result.outputs??{}).length,evidenceRecords:result.outputs?.DISCOVERY?.evidence?.length??0,
    receiptCount:engine.receipts.filter(x=>x.jobId===job.id).length,bankingTransfersInitiated:0,hostedAIAgentsDeployed:0};
}

const isCLI=Boolean(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url);
if(isCLI){
  const [rosterPath,manifestPath,mode]=process.argv.slice(2);
  if(!rosterPath||!manifestPath||!['--validate-only','--execute-one-research-job'].includes(mode)){
    console.error('Usage: node run-queued-official-doc-research.mjs <144-roster.json> <19-lane-manifest.json> --validate-only|--execute-one-research-job');
    process.exitCode=2;
  }else{
    try{
      const roster=JSON.parse(readFileSync(rosterPath,'utf8'));
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      const info=validateQueuedResearchManifest(roster,manifest);
      if(mode==='--validate-only')console.log(JSON.stringify({status:'VALIDATED_NO_EXTERNAL_ACTION',...info}));
      else{
        const queue=new SupabaseResearchQueue({projectUrl:process.env.SONORAPORT_SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
        const result=await runOneAuthorizedQueuedResearchJob({queue,roster,manifest,tinyfishApiKey:process.env.TINYFISH_API_KEY});
        console.log(JSON.stringify(result));
        if(result.state==='BLOCKED_UNAUTHORIZED_TASK'||(result.state==='JOB_COMPLETE'&&result.status!=='RESEARCH_PIPELINE_PASSED'))process.exitCode=1;
      }
    }catch(e){console.error('KINO_RESEARCH_WORKER_BLOCKED:',safeErrorCode(e));process.exitCode=1;}
  }
}
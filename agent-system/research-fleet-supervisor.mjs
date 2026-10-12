/**
 * KINO #281102 — bounded SWARM/SKIM research fleet supervisor.
 * One process, at most 8 concurrent QUEUE job workers; no perpetual poller.
 * Uses existing research-only job queue, approved regional manifest and
 * official-document TinyFish Search/Fetch connector; never moves funds.
 *
 * This starts actual worker tasks when attached to a live authorized queue and
 * TinyFish key. It does not instantiate 144 LLMs or claim 144 hosted agents.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateQueuedResearchManifest,runOneAuthorizedQueuedResearchJob} from './run-queued-official-doc-research.mjs';
import {TinyFishDocumentClient} from './tinyfish-research-adapter.mjs';
import {SupabaseResearchQueue} from './supabase-job-store.mjs';

const WORKER=/^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_OUTCOMES=new Set(['JOB_COMPLETE','NO_JOB_AVAILABLE','BLOCKED_UNAUTHORIZED_TASK']);
function safeError(_error){return 'WORKER_TRANSPORT_OR_LEASE_FAILED';}

/** Finite budget; designed to be invoked once by an authorized backend runtime. */
export async function runBoundedResearchFleet({
  queue,roster,manifest,tinyfishApiKey,fetchImpl,
  workerCount=4,maxClaims=18,workerPrefix='KINO-281102',
  runTask=runOneAuthorizedQueuedResearchJob,
}) {
  const approval=validateQueuedResearchManifest(roster,manifest);
  if(!Number.isInteger(workerCount)||workerCount<1||workerCount>8)throw Error('WORKER_COUNT_OUT_OF_RANGE');
  if(!Number.isInteger(maxClaims)||maxClaims<1||maxClaims>144)throw Error('CLAIM_BUDGET_OUT_OF_RANGE');
  if(typeof workerPrefix!=='string'||!WORKER.test(workerPrefix))throw Error('INVALID_WORKER_PREFIX');
  if(!queue||typeof queue.claim!=='function'||typeof queue.appendReceipt!=='function'||typeof queue.finish!=='function')throw Error('RESEARCH_QUEUE_REQUIRED');
  if(typeof runTask!=='function')throw Error('RESEARCH_TASK_RUNNER_REQUIRED');
  // Validate credentials/transport BEFORE claiming any jobs.
  new TinyFishDocumentClient({apiKey:tinyfishApiKey,fetchImpl,allowedHosts:manifest.allowedHosts});
  const results=[];
  let nextClaim=0,active=0,highWater=0,failed=0;
  async function worker(slot){
    const workerName=`${workerPrefix}-${String(slot+1).padStart(2,'0')}`;
    while(nextClaim<maxClaims){
      nextClaim+=1;
      active+=1;highWater=Math.max(highWater,active);
      let result;
      try {
        result=await runTask({queue,roster,manifest,tinyfishApiKey,fetchImpl,workerName});
      } catch(err) {
        failed+=1;
        // Return an operational failure receipt with no secret values.
        results.push({workerName,state:'WORKER_FAILED',reason:safeError(err)});
        break; // Caller must review failure; leased job expires for controlled retry.
      } finally {active-=1;}
      if(!result||!SAFE_OUTCOMES.has(result.state)){
        failed+=1;results.push({workerName,state:'WORKER_FAILED',reason:'INVALID_WORKER_RESULT'});
        break;
      }
      if(result.state==='NO_JOB_AVAILABLE')break;
      results.push({workerName,state:result.state,jobId:String(result.jobId??'').slice(0,120),
        lane:String(result.lane??'').slice(0,100),status:String(result.status??'').slice(0,64),
        stageCount:result.stageCount??0,receiptCount:result.receiptCount??0});
      if(result.state==='BLOCKED_UNAUTHORIZED_TASK'||result.status!=='RESEARCH_PIPELINE_PASSED'){
        failed+=1;break;
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(workerCount,maxClaims)},(_,i)=>worker(i)));
  const completed=results.filter(x=>x.state==='JOB_COMPLETE'&&x.status==='RESEARCH_PIPELINE_PASSED').length;
  return Object.freeze({
    mode:'FINITE_AUTHORIZED_QUEUE_FLEET',
    logicalAgentsDefined:approval.logicalAgents,
    regionalLanes:approval.regionalLanes,
    approvedJobs:approval.approvedPublicResearchJobs,
    requestedWorkers:workerCount,
    concurrentWorkersObserved:highWater,
    ticketsConsumed:nextClaim,
    claimBudget:maxClaims,
    jobsCompleted:completed,
    jobsFailedOrBlocked:failed,
    authorizedStagingDatabaseRequired:true,
    hostedLLMAgentsVerified:0,
    liveBankingConnectionsVerified:0,
    bankingTransfersInitiated:0,
    results,
  });
}

const isCLI=Boolean(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url);
if(isCLI){
  const [rosterPath,manifestPath,flag]=process.argv.slice(2);
  if(flag!=='--execute-bounded-research'||!rosterPath||!manifestPath){
    console.error('Usage: node research-fleet-supervisor.mjs <roster.json> <manifest.json> --execute-bounded-research');
    process.exitCode=2;
  }else{
    try {
      if(process.env.SONORAPORT_RESEARCH_STAGING_APPROVED!=='true')throw Error('STAGING_APPROVAL_REQUIRED');
      const roster=JSON.parse(readFileSync(rosterPath,'utf8'));
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      const queue=new SupabaseResearchQueue({projectUrl:process.env.SONORAPORT_SUPABASE_URL,
        serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
      const report=await runBoundedResearchFleet({queue,roster,manifest,tinyfishApiKey:process.env.TINYFISH_API_KEY,
        workerCount:Math.min(4,Number(process.env.KINO_WORKER_COUNT||4)),maxClaims:Math.min(18,Number(process.env.KINO_MAX_CLAIMS||18))});
      // Safe counts only, never emit provider source content or credentials.
      console.log(JSON.stringify({mode:report.mode,ticketsConsumed:report.ticketsConsumed,
        jobsCompleted:report.jobsCompleted,jobsFailedOrBlocked:report.jobsFailedOrBlocked,
        concurrentWorkersObserved:report.concurrentWorkersObserved}));
      if(report.jobsFailedOrBlocked)process.exitCode=1;
    }catch(_e){console.error('KINO_RESEARCH_FLEET_BLOCKED');process.exitCode=1;}
  }
}
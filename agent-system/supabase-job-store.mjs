/**
 * Research-only Supabase job store for SonoraPort.
 * Uses service_role only on a trusted server. Do not bundle into browser code.
 * Database migration must be applied separately after approval.
 */
const JOB_KEYS = new Set(['id','provider','lane','intent','sourceUrls']);
function safePublicSource(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port
      && !/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\]|.*\.local|.*\.internal)$/i.test(u.hostname);
  } catch {return false;}
}
function validateOrigin(value) {
  const u=new URL(value);
  if (u.protocol!=='https:' || u.username || u.password || u.port || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)) throw Error('SUPABASE_URL_NOT_TRUSTED');
  return u.origin;
}
export class SupabaseResearchQueue {
  #serviceKey;
  constructor({projectUrl,serviceRoleKey,fetchImpl=fetch}) {
    this.origin=validateOrigin(projectUrl);
    if(typeof serviceRoleKey!=='string'||serviceRoleKey.length<20) throw Error('SERVICE_ROLE_CREDENTIAL_MISSING');
    if(typeof fetchImpl!=='function') throw Error('fetchImpl must be a function');
    this.#serviceKey=serviceRoleKey;
    this.fetchImpl=fetchImpl;
  }
  async request(path,body,prefer='') {
    const res=await this.fetchImpl(this.origin+'/rest/v1/'+path,{
      method:'POST',
      headers:{'apikey':this.#serviceKey,'Authorization':'Bearer '+this.#serviceKey,
        'Content-Type':'application/json',...(prefer?{'Prefer':prefer}:{})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    });
    if(!res?.ok) throw Error('SUPABASE_RESEARCH_REQUEST_FAILED');
    const text=await res.text();
    return text?JSON.parse(text):null;
  }
  async enqueue(job) {
    if(!job||!Object.keys(job).every(k=>JOB_KEYS.has(k))||!job.id||!job.provider||!job.lane||!Array.isArray(job.sourceUrls)||!['PUBLIC_RESEARCH','AUTHORIZED_DOCUMENTATION_RESEARCH'].includes(job.intent)) throw Error('INVALID_RESEARCH_QUEUE_JOB');
    if (!job.sourceUrls.length || job.sourceUrls.length>16 || job.sourceUrls.some(s=>!safePublicSource(s))) throw Error('INVALID_RESEARCH_QUEUE_SOURCES');
    return this.request('sonoraport_swarm_research_jobs?on_conflict=task_key',{
      task_key:job.id,provider:job.provider,lane:job.lane,intent:job.intent,source_urls:job.sourceUrls,
    },'resolution=ignore-duplicates,return=minimal');
  }
  async claim(workerName) {
    if(typeof workerName!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(workerName)) throw Error('INVALID_WORKER_NAME');
    const job=await this.request('rpc/sonoraport_claim_research_job',{p_worker_name:workerName,p_lease_seconds:120});
    if(!job) return null;
    if(!job.lease_token||!job.id||!job.task_key) throw Error('INVALID_LEASE_RESPONSE');
    return job;
  }
  async finish(claim,result) {
    if(!claim?.id||!claim?.lease_token||!result?.status) throw Error('INVALID_JOB_FINISH');
    const status=['RESEARCH_REPLAY_PASSED','RESEARCH_PIPELINE_PASSED'].includes(result.status)?result.status:'BLOCKED';
    const summary={jobId:result.jobId??null,lane:result.lane??claim.lane,provider:result.provider??claim.provider,
      stagesCompleted:Object.keys(result.outputs??{}).length,financialOperation:false,productionConnected:false};
    return this.request('rpc/sonoraport_finish_research_job',{
      p_job_id:claim.id,p_lease_token:claim.lease_token,p_status:status,
      p_summary:summary,p_error_code:status==='BLOCKED'?(result.reason??'UNKNOWN_BLOCK_REASON'):null
    });
  }
  async appendReceipt(claim,receipt) {
    if(!claim?.id||!receipt?.digest||!receipt?.stage||!receipt?.status) throw Error('INVALID_RECEIPT');
    return this.request('sonoraport_swarm_research_receipts',{
      job_id:claim.id,agent_id:receipt.workerId??'KINO-ORCHESTRATOR',stage:receipt.stage,
      status:receipt.status,evidence_digest:receipt.digest,source_urls:[]
    },'return=minimal');
  }
}

/** Executes one authorized queued research job only; no transaction initiation. */
export async function runResearchQueueOnce({queue,engine,workerName='KINO-RESEARCH-WORKER'}) {
  const claim=await queue.claim(workerName);
  if(!claim) return {state:'NO_JOB_AVAILABLE'};
  const job={id:claim.task_key,lane:claim.lane,provider:claim.provider,sourceUrls:claim.source_urls,intent:claim.intent};
  const before=engine.receipts.length;
  const result=await engine.run(job);
  for(const r of engine.receipts.slice(before).filter(x=>x.jobId===job.id)) await queue.appendReceipt(claim,r);
  const accepted=await queue.finish(claim,result);
  if(accepted!==true) throw Error('JOB_LEASE_NO_LONGER_VALID');
  return {state:'JOB_COMPLETE',jobId:job.id,researchStatus:result.status,stagesCompleted:Object.keys(result.outputs||{}).length};
}
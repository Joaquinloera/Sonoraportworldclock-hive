import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseResearchQueue,runResearchQueueOnce} from './supabase-job-store.mjs';
const origin='https://utnassdlhanlxbcovjmc.supabase.co';
const secret='f'.repeat(64);
const source='https://www.cips.com.cn/kjjqgsyyingw/index/index.shtml';
const job={id:'cips-public-1',lane:'CHINA',provider:'CIPS',sourceUrls:[source],intent:'PUBLIC_RESEARCH'};
test('trusted server-side Supabase service key and safe queue enqueue',async()=>{
 const logs=[];const queue=new SupabaseResearchQueue({projectUrl:origin,serviceRoleKey:secret,fetchImpl:async(url,opts)=>{logs.push({url,opts});return {ok:true,text:async()=>''};}});
 await queue.enqueue(job);
 assert.equal(logs.length,1);assert.equal(logs[0].url,origin+'/rest/v1/sonoraport_swarm_research_jobs?on_conflict=task_key');
 const body=JSON.parse(logs[0].opts.body);assert.deepEqual(body.source_urls,[source]);assert.equal(body.task_key,job.id);
 assert.ok(!logs[0].opts.body.includes(secret));
});
test('rejects untrusted Supabase hosts and missing keys',()=>{
 for(const u of ['http://wrong.supabase.co','https://sub.supabase.co.attacker.io','https://localhost:54321','https://evil.com']) assert.throws(()=>new SupabaseResearchQueue({projectUrl:u,serviceRoleKey:secret}));
 assert.throws(()=>new SupabaseResearchQueue({projectUrl:origin,serviceRoleKey:''}),/SERVICE_ROLE_CREDENTIAL_MISSING/);
});
test('job credentials cannot enter the queue and HTTP errors redact bodies',async()=>{
 const q=new SupabaseResearchQueue({projectUrl:origin,serviceRoleKey:secret,fetchImpl:async()=>({ok:false,status:401,text:async()=>`TOP_SECRET_${secret}`})});
 await assert.rejects(q.enqueue({...job,apiKey:'bad'}),/INVALID_RESEARCH_QUEUE_JOB/);
 await assert.rejects(q.enqueue(job),e=>e.message==='SUPABASE_RESEARCH_REQUEST_FAILED');
});
test('one leased research job produces append-only receipts and finishes safely',async()=>{
 const calls=[];const claim={id:'4d36cace-9e7e-489a-94e8-8dbff28f7b90',task_key:job.id,lane:job.lane,provider:job.provider,intent:job.intent,source_urls:job.sourceUrls,lease_token:'f11509ad-93f2-4cda-ac86-ac53b7b0a27a'};
 const fetchImpl=async(url,opts)=>{calls.push(url);let payload=null;
  if(url.endsWith('/rpc/sonoraport_claim_research_job'))payload=claim;
  if(url.endsWith('/rpc/sonoraport_finish_research_job'))payload=true;
  return {ok:true,text:async()=>payload===null?'':JSON.stringify(payload)};};
 const q=new SupabaseResearchQueue({projectUrl:origin,serviceRoleKey:secret,fetchImpl});
 const engine={receipts:[],run:async j=>{engine.receipts=[{jobId:j.id,stage:'DISCOVERY',status:'COMPLETED',digest:'a'.repeat(64),workerId:'#TEST'}];return {jobId:j.id,status:'RESEARCH_PIPELINE_PASSED',provider:j.provider,lane:j.lane,outputs:{DISCOVERY:{}}};}};
 const result=await runResearchQueueOnce({queue:q,engine});assert.equal(result.state,'JOB_COMPLETE');assert.equal(result.stagesCompleted,1);assert.equal(calls.filter(s=>s.endsWith('/rpc/sonoraport_claim_research_job')).length,1);assert.equal(calls.filter(s=>s.endsWith('/sonoraport_swarm_research_receipts')).length,1);assert.equal(calls.filter(s=>s.endsWith('/rpc/sonoraport_finish_research_job')).length,1);
});
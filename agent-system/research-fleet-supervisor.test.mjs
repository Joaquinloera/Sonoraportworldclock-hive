import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runBoundedResearchFleet} from './research-fleet-supervisor.mjs';
const roster=JSON.parse(readFileSync(new URL('./sonoraport-144-agent-roster.json',import.meta.url)));
const urls=['https://www.cips.com.cn/kjjqgsyyingw/2025-12/10/article_2025121011242061513.shtml','https://www.cips.com.cn/kjjqgsyyingw/2025-12/11/article_2025121115151515220.shtml'];
const job={id:'official-china-20261012',lane:'CHINA',provider:'CIPS',sourceUrls:urls};
const manifest={allowedHosts:['www.cips.com.cn'],jobs:[job],coverage:roster.regionalLanes.map(x=>({lane:x.id,...(x.id==='CHINA'?{sourceVerificationStatus:'TWO_OFFICIAL_DOCS_FETCHED',sourceUrls:urls}:{sourceVerificationStatus:'OFFICIAL_DOCS_RESEARCH_PENDING'})}))};
const queue={claim:async()=>null,finish:async()=>true,appendReceipt:async()=>{}};
const mockFetch=async()=>({ok:true,text:async()=>'{"results":[],"errors":[]}'});
const opts={queue,roster,manifest,tinyfishApiKey:'TEST_ONLY_FAKE_KEY_0123456789',fetchImpl:mockFetch};
test('does not claim 144 hosted workers or financial connectivity',async()=>{
 const result=await runBoundedResearchFleet({...opts,maxClaims:1,runTask:async()=>({state:'NO_JOB_AVAILABLE'})});
 assert.equal(result.logicalAgentsDefined,144);assert.equal(result.hostedLLMAgentsVerified,0);assert.equal(result.bankingTransfersInitiated,0);
});
test('multiple real job-runner invocations run with bounded parallelism',async()=>{
 let active=0,highWater=0,index=0;
 const runTask=async()=>{active++;highWater=Math.max(highWater,active);await new Promise(r=>setTimeout(r,3));active--;return {state:'JOB_COMPLETE',jobId:'test-'+index++,lane:'CHINA',status:'RESEARCH_PIPELINE_PASSED',stageCount:6,receiptCount:14};};
 const result=await runBoundedResearchFleet({...opts,workerCount:8,maxClaims:40,runTask});
 assert.equal(result.jobsCompleted,40);assert.equal(result.concurrentWorkersObserved,8);assert.ok(highWater<=8);assert.equal(result.ticketsConsumed,40);
});
test('worker limit and finite claim budget enforce hard caps',async()=>{
 for(const workerCount of [-1,0,9,1.5]) await assert.rejects(runBoundedResearchFleet({...opts,workerCount}),/WORKER_COUNT_OUT_OF_RANGE/);
 for(const maxClaims of [-1,0,145,1.5]) await assert.rejects(runBoundedResearchFleet({...opts,maxClaims}),/CLAIM_BUDGET_OUT_OF_RANGE/);
});
test('missing TinyFish key blocks before claiming any job',async()=>{
 let called=0;
 await assert.rejects(runBoundedResearchFleet({...opts,tinyfishApiKey:'',runTask:async()=>{called++;}}),/TINYFISH_SERVER_KEY_REQUIRED/);
 assert.equal(called,0);
});
test('no work available immediately stops the fleet',async()=>{
 let calls=0;
 const result=await runBoundedResearchFleet({...opts,workerCount:8,maxClaims:80,runTask:async()=>{calls++;return {state:'NO_JOB_AVAILABLE'}}});
 assert.equal(calls,8);assert.equal(result.jobsCompleted,0);assert.equal(result.ticketsConsumed,8);
});
test('failed lease or HTTP exception is sanitized and halts its worker',async()=>{
 const result=await runBoundedResearchFleet({...opts,workerCount:1,maxClaims:8,runTask:async()=>{throw Error('RAW_SECRET_INVALID_SESSION_STRING')}});
 assert.equal(result.jobsFailedOrBlocked,1);assert.equal(result.ticketsConsumed,1);assert.equal(result.results[0].reason,'WORKER_TRANSPORT_OR_LEASE_FAILED');
 assert.ok(!JSON.stringify(result).includes('RAW_SECRET'));
});
test('unapproved queued job blocks its worker without continuing',async()=>{
 let calls=0;
 const result=await runBoundedResearchFleet({...opts,workerCount:1,maxClaims:8,runTask:async()=>{calls++;return {state:'BLOCKED_UNAUTHORIZED_TASK',jobId:'unknown'}}});
 assert.equal(result.jobsFailedOrBlocked,1);assert.equal(calls,1);
});
test('pending or partial jobs are not reported as complete',async()=>{
 const result=await runBoundedResearchFleet({...opts,workerCount:1,maxClaims:2,runTask:async()=>({state:'JOB_COMPLETE',status:'BLOCKED'})});
 assert.equal(result.jobsCompleted,0);assert.equal(result.jobsFailedOrBlocked,1);
});
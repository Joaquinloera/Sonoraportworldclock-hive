import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runPublicDocumentSwarm,validatePublicSwarmManifest,SKIM_ROLES} from './public-document-swarm.mjs';
const manifest=JSON.parse(readFileSync(new URL('./public-document-swarm-targets.json',import.meta.url)));
const lanes=['CHINA','INDIA','BRAZIL','RUSSIA','SOUTH_AFRICA','EGYPT','ETHIOPIA','IRAN','UAE','SAUDI_ARABIA','INDONESIA','US_CANADA','MEXICO','SOUTH_AMERICA','CARIBBEAN','EUROPE','AFRICA_OTHER','ASIA_PACIFIC','GLOBAL_RAILS'];
function rosterFixture(){const agents=Array.from({length:30},(_,i)=>({id:'#OLD'+i,role:'ORIGINAL_AGENT'}));let id=281110;
 for(const lane of lanes)for(const workerRole of SKIM_ROLES)agents.push({id:'#'+id++,lane,workerRole,financialTransferPermission:false});
 return {agents,regionalLanes:lanes.map(id=>({id}))};}
const roster=rosterFixture();
const mockHtml='<html><title>Bank Payments Developer</title><body><h1>Official payment developer API documentation</h1><p>OAuth authentication and certificate requirements. sandbox testing and institutional participant approval are required before production integration.</p><p>No banking partner credentials or bank accounts are granted by documentation alone.</p></body></html>';
const ok=async() => ({ok:true,status:200,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>mockHtml});
test('validates eight approved real public documents over 19 lanes and 144 logical agents',()=>{const a=validatePublicSwarmManifest(roster,manifest);assert.equal(a.approvedJobs,8);assert.equal(a.agentRolesDefined,144);assert.equal(a.lanes,5);});
test('executes bounded parallel GET research and stage-role mapping with evidence digests',async()=>{
 let concurrent=0,high=0,calls=0;const transport=async(url,opt)=>{calls++;assert.equal(opt.method,'GET');assert.equal(opt.redirect,'error');assert.ok(url.startsWith('https://'));concurrent++;high=Math.max(high,concurrent);
 await new Promise(resolve=>setTimeout(resolve,5));concurrent--;return ok();};
 const r=await runPublicDocumentSwarm({roster,manifest,fetchImpl:transport,maxConcurrent:3});
 assert.equal(calls,8);assert.equal(r.documentsFetched,8);assert.equal(r.documentsBlocked,0);assert.equal(r.requestsAttempted,8);assert.equal(r.maxConcurrentObserved,3);assert.equal(high,3);
 assert.equal(r.independentHostedLLMAgentsVerified,0);assert.equal(r.paymentsInitiated,0);
 for(const receipt of r.officialDocumentReceipts){assert.equal(receipt.stages.length,6);assert.match(receipt.fetchedDocumentSha256,/^[0-9a-f]{64}$/);
   assert.equal(receipt.liveBankingConnection,false);assert.equal(receipt.credentialsPossessed,false);assert.ok(receipt.stages.some(x=>x.stage==='API_AUTH_SKIM'&&x.keywordSignals.includes('oauth')));
   assert.equal(receipt.stages.find(x=>x.stage==='INTEGRATION_TEST').conclusion,'NO_SANDBOX_TEST_RUN');}
});
test('prohibits unknown or credential-bearing URL and preserves known host allowlist',()=>{
 for(const url of ['http://developer.citi.com/apidocs/','https://example.com/','https://developer.citi.com/?token=secret','https://user:pass@developer.citi.com','https://127.0.0.1','https://developer.citi.com:8443/apidocs/']){
  const bad=structuredClone(manifest);bad.jobs[0].url=url;assert.throws(()=>validatePublicSwarmManifest(roster,bad),/INVALID_PUBLIC_SOURCE_URL/);
 }
});
test('rejects inflated hosted-agent/production claims and duplicate IDs before fetching',()=>{
 for(const change of [x=>x.productionBankingEnabled=true,x=>x.hostedAgentClaims=true,x=>x.jobs.push({...x.jobs[0]})]){
  const bad=structuredClone(manifest);change(bad);assert.throws(()=>validatePublicSwarmManifest(roster,bad));
 }
});
test('enforces missing specialist assignment and financial permission guard',()=>{
 const bad=structuredClone(roster);bad.agents.find(a=>a.lane==='CHINA').financialTransferPermission=true;
 assert.throws(()=>validatePublicSwarmManifest(bad,manifest),/REGIONAL_AGENT_ASSIGNMENTS_UNVERIFIED/);
});
test('handles HTTP errors and unsupported media types as failed document receipts',async()=>{
 const r=await runPublicDocumentSwarm({roster,manifest,fetchImpl:async(url)=>url.includes('developer.citi.com')?{ok:false,status:403}:({ok:true,headers:{get:()=> 'application/pdf'},text:async()=>mockHtml}),maxConcurrent:2});
 assert.equal(r.documentsFetched,0);assert.equal(r.documentsBlocked,8);assert.equal(r.officialDocumentReceipts[0].reason,'DOCUMENT_CONTENT_TYPE_UNSUPPORTED');
 assert.equal(r.officialDocumentReceipts[1].reason,'OFFICIAL_SOURCE_HTTP_ERROR');
});
test('rejects oversize and empty pages without treating them as verification',async()=>{
 const r=await runPublicDocumentSwarm({roster,manifest,fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},text:async()=> 'A'.repeat(1_500_100)})});
 assert.equal(r.documentsFetched,0);assert.equal(r.officialDocumentReceipts[0].reason,'DOCUMENT_OVERSIZE');
});
test('limits worker concurrency and rejects unbounded retries',async()=>{
 await assert.rejects(runPublicDocumentSwarm({roster,manifest,fetchImpl:ok,maxConcurrent:9}),/CONCURRENCY_BOUND_REQUIRED/);
 await assert.rejects(runPublicDocumentSwarm({roster,manifest,fetchImpl:ok,timeoutMs:0}),/TIMEOUT_BOUND_REQUIRED/);
});

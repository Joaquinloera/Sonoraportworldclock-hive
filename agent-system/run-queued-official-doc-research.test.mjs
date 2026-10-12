import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateQueuedResearchManifest,authorizeClaim,runOneAuthorizedQueuedResearchJob} from './run-queued-official-doc-research.mjs';
const roster=JSON.parse(readFileSync(new URL('./sonoraport-144-agent-roster.json',import.meta.url)));
const a='https://www.cips.com.cn/kjjqgsyyingw/2025-12/10/article_2025121011242061513.shtml';
const b='https://www.cips.com.cn/kjjqgsyyingw/2025-12/11/article_2025121115151515220.shtml';
const j={id:'official-china-20261012',lane:'CHINA',provider:'CIPS',sourceUrls:[a,b]};
const coverage=roster.regionalLanes.map(l=>l.id==='CHINA'?{lane:l.id,sourceUrls:[a,b],sourceVerificationStatus:'TWO_OFFICIAL_DOCS_FETCHED'}:{lane:l.id,sourceVerificationStatus:'OFFICIAL_DOCS_RESEARCH_PENDING'});
const manifest={allowedHosts:['www.cips.com.cn'],jobs:[j],coverage};
const claim={id:'c4a4031a-7792-4dd3-bcae-acbe043427f1',lease_token:'59c5e5ad-80f4-41e8-8667-c3c1c9873911',task_key:j.id,lane:j.lane,provider:j.provider,intent:'PUBLIC_RESEARCH',source_urls:[b,a]};
const fakeHttp=async(url,opts)=>({ok:true,text:async()=>JSON.stringify({results:JSON.parse(opts.body).urls.map(x=>({url:x,title:'Official document',text:'This official payment network participant rule describes onboarding and settlement. API key registration and SDK sandbox permissions are unverified.'})),errors:[]})});
function fakeQueue(value=claim){const state={claimed:0,receipts:[],finished:[]};return {state,claim:async()=>{state.claimed++;return value},appendReceipt:async(c,r)=>{state.receipts.push(r)},finish:async(c,r)=>{state.finished.push(r);return true}};}
test('authoritative 144-agent roster and research-only manifesto validated',()=>{const d=validateQueuedResearchManifest(roster,manifest);assert.equal(d.logicalAgents,144);assert.equal(d.regionalLanes,19);assert.equal(d.approvedPublicResearchJobs,1);assert.equal(d.pendingRegionalLanes,18);});
test('exact source, lane, provider and intent matching before network work',()=>{
 assert.deepEqual(authorizeClaim(claim,manifest).sourceUrls,[a,b]);
 for(const r of [{...claim,task_key:'unknown'},{...claim,lane:'RUSSIA'},{...claim,provider:'Fake'},
  {...claim,intent:'FINANCIAL_TRANSFER'},{...claim,source_urls:[a,'https://www.attacker.com']}])assert.throws(()=>authorizeClaim(r,manifest));
});
test('real bound research worker handles approved leased job with mocked TinyFish transport',async()=>{
 const q=fakeQueue();let callCount=0;
 const http=async(url,opts)=>{callCount++;return fakeHttp(url,opts)};
 const result=await runOneAuthorizedQueuedResearchJob({queue:q,roster,manifest,tinyfishApiKey:'FAKE_TEST_SERVER_SIDE_KEY',fetchImpl:http});
 assert.equal(result.state,'JOB_COMPLETE');assert.equal(result.status,'RESEARCH_PIPELINE_PASSED');
 assert.equal(result.stageCount,6);assert.equal(result.receiptCount,14);assert.equal(callCount,1);
 assert.equal(q.state.receipts.length,14);assert.equal(q.state.finished[0].status,'RESEARCH_PIPELINE_PASSED');
 assert.equal(result.bankingTransfersInitiated,0);
});
test('unauthorized queued job is blocked without network',async()=>{
 const q=fakeQueue({...claim,source_urls:[a,'https://example.com/']});let calls=0;
 const res=await runOneAuthorizedQueuedResearchJob({queue:q,roster,manifest,tinyfishApiKey:'FAKE_TEST_SERVER_SIDE_KEY',fetchImpl:async()=>{calls++;throw Error('MUST_NOT_CALL')}});
 assert.equal(calls,0);assert.equal(res.state,'BLOCKED_UNAUTHORIZED_TASK');assert.equal(q.state.finished[0].status,'BLOCKED');
});
test('missing service credential blocks before leasing a queued job',async()=>{
 const q=fakeQueue();await assert.rejects(runOneAuthorizedQueuedResearchJob({queue:q,roster,manifest,tinyfishApiKey:''}),/TINYFISH_SERVER_KEY_REQUIRED/);
 assert.equal(q.state.claimed,0);
});
test('no queued task performs no document fetch',async()=>{
 const q=fakeQueue(null);let calls=0;
 const result=await runOneAuthorizedQueuedResearchJob({queue:q,roster,manifest,tinyfishApiKey:'FAKE_TEST_SERVER_SIDE_KEY',fetchImpl:async()=>{calls++;throw Error('Should not be called')}});
 assert.equal(result.state,'NO_JOB_AVAILABLE');assert.equal(calls,0);
});
test('receipt storage failure leaves lease unfinalized for retry',async()=>{
 const q=fakeQueue();q.appendReceipt=async()=>{throw Error('RECEIPT_STORAGE_FAILED')};
 await assert.rejects(runOneAuthorizedQueuedResearchJob({queue:q,roster,manifest,tinyfishApiKey:'FAKE_TEST_SERVER_SIDE_KEY',fetchImpl:fakeHttp}),/RECEIPT_STORAGE_FAILED/);
 assert.equal(q.state.finished.length,0);
});
test('manifest rejects duplicate URLs and invalid source domains',()=>{
 const copies=[{...manifest,jobs:[{...j,sourceUrls:[a,a]}]},
 {...manifest,jobs:[{...j,sourceUrls:[a,'https://evil.example/test']}]},
 {...manifest,jobs:[{...j,sourceUrls:[a,'https://www.cips.com.cn/?token=secret']}]},
 {...manifest,jobs:[{...j,sourceUrls:[a,b],id:'x'}],coverage:[{...coverage[0],lane:'CHINA',sourceUrls:[a,a]},...coverage.slice(1)]}];
 for(const m of copies)assert.throws(()=>validateQueuedResearchManifest(roster,m),/INVALID_APPROVED_MANIFEST/);
});
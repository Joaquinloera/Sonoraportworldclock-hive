import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runOfficialDocumentJobs} from './run-live-official-doc-research.mjs';
const roster=JSON.parse(readFileSync(new URL('./sonoraport-144-agent-roster.json',import.meta.url)));
const a='https://www.cips.com.cn/kjjqgsyyingw/2025-12/10/article_2025121011242061513.shtml';
const b='https://www.cips.com.cn/kjjqgsyyingw/2025-12/11/article_2025121115151515220.shtml';
const manifest={allowedHosts:['www.cips.com.cn'],jobs:[{id:'ch-cips-1',lane:'CHINA',provider:'CIPS',sourceUrls:[a,b]}]};
const body='Participants applying to join banking payment clearing service. Visit official developer portal for API information. SDK and sandbox authorization pending.';
const fake=async (url,init)=>({ok:true,text:async()=>JSON.stringify({results:JSON.parse(init.body).urls.map(u=>({url:u,text:body,title:'Official CIPS documentation'})),errors:[]})});
test('CLI service runs bound bank research roles with mock HTTP, never claims hosted AI agents or bank access',async()=>{
 const s=await runOfficialDocumentJobs({roster,manifest,apiKey:'LOCAL_FAKE_KEY',fetchImpl:fake});
 assert.equal(s.tasksAttempted,1);assert.equal(s.tasksResearchPipelinePassed,1);assert.equal(s.receipts,14);
 assert.equal(s.liveHostedAIAgentsDeployed,0);assert.equal(s.externalBankingConnectionsVerified,0);assert.equal(s.bankingTransfersInitiated,0);
 assert.equal(s.jobs[0].evidence.length,2);
});
test('single-source jobs blocked before network',async()=>{
 await assert.rejects(runOfficialDocumentJobs({roster,manifest:{...manifest,jobs:[{...manifest.jobs[0],sourceUrls:[a]}]},apiKey:'LOCAL_FAKE_KEY',fetchImpl:fake}),/TWO_OFFICIAL_DOCS_REQUIRED/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ResearchEngine,RESEARCH_STAGES} from './research-engine.mjs';
import {TinyFishDocumentClient,makeOfficialDocumentAdapters,bindDocumentResearchRoster} from './tinyfish-research-adapter.mjs';
const a='https://www.cips.com.cn/kjjqgsyyingw/index/index.shtml';
const b='https://www.cips.com.cn/kjjqgsyyingw/cipsfw/index.shtml';
const doc='Official participant payment access information. Onboard new institutional participants and their banking systems. Developer API authorizations are documented by the service provider.';
const roster=JSON.parse(readFileSync(new URL('./sonoraport-144-agent-roster.json',import.meta.url),'utf8'));
const job={id:'cips-public',provider:'CIPS',lane:'CHINA',sourceUrls:[a,b],intent:'PUBLIC_RESEARCH'};
const key='IN_MEMORY_TEST_KEY_NOT_REAL';
const ok=(v)=>({ok:true,text:async()=>JSON.stringify(v)});
function fake(reqs){return new TinyFishDocumentClient({apiKey:key,allowedHosts:['www.cips.com.cn'],fetchImpl:async (url,init)=>{
  reqs.push({url,init});
  if(url==='https://api.fetch.tinyfish.ai'){const urls=JSON.parse(init.body).urls;return ok({results:urls.map(u=>({url:u,title:u===a?'CIPS home':'CIPS services',text:doc+(u===b?' More payment settlement regulations.':'')})),errors:[]});}
  return ok({results:[{url:a,title:'CIPS official'},{url:'https://attacker.example.com/',title:'BAD'}]});
}})}
test('official documented endpoint, method, header, sources and one network fetch per job',async()=>{
 const requests=[];const client=fake(requests);
 const e=new ResearchEngine({roster:bindDocumentResearchRoster(roster,['CHINA']),adapters:makeOfficialDocumentAdapters(client)});
 const result=await e.run(job);
 assert.equal(result.status,'RESEARCH_PIPELINE_PASSED');
 assert.deepEqual(Object.keys(result.outputs),RESEARCH_STAGES);
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'https://api.fetch.tinyfish.ai');
 assert.equal(requests[0].init.method,'POST');
 assert.equal(requests[0].init.headers['X-API-Key'],key);
 assert.deepEqual(JSON.parse(requests[0].init.body).urls,[a,b]);
 assert.equal(e.receipts.length,14);
 assert.equal(result.outputs.API_AUTH_SKIM.findings.kind,'DETERMINISTIC_KEYWORD_SKIM_NOT_LLM');
 assert.ok(!JSON.stringify(e.receipts).includes(key));
 assert.equal(result.outputs.CROSS_CHECK_EVIDENCE.findings.crossCheckLevel,'TWO_PUBLIC_DOCUMENTS_NOT_INDEPENDENT_PROVIDER_AUTHORIZATION');
});
test('search rejects results outside explicitly approved domains',async()=>{
 const requests=[];const c=fake(requests);const r=await c.searchOfficial('official CIPS participant access');
 assert.equal(r.length,1);assert.equal(r[0].url,a);assert.equal(r[0].sourceType,'SEARCH_LEAD_NOT_FETCHED');
 assert.equal(requests[0].init.method,'GET');
 assert.ok(requests[0].url.startsWith('https://api.search.tinyfish.ai/?query='));
});
test('credential-bearing URL parameters and unapproved hosts are blocked without HTTP call',async()=>{
 const reqs=[];const c=fake(reqs);
 for(const url of ['http://www.cips.com.cn/','https://www.cips.com.cn:8443','https://www.cips.com.cn.attacker.net','https://www.cips.com.cn/?api_key=notreally','https://127.0.0.1']) await assert.rejects(c.fetchOfficial([url]));
 assert.equal(reqs.length,0);
});
test('TinyFish HTTP failures or partial result are redacted and fail closed',async()=>{
 const c=new TinyFishDocumentClient({apiKey:key,allowedHosts:['www.cips.com.cn'],fetchImpl:async()=>({ok:false,status:401,text:async()=>`secret ${key}`})});
 await assert.rejects(c.fetchOfficial([a]),e=>e.message==='TINYFISH_DOCUMENT_REQUEST_FAILED');
 const partial=new TinyFishDocumentClient({apiKey:key,allowedHosts:['www.cips.com.cn'],fetchImpl:async()=>ok({results:[{url:a,text:doc}],errors:[{url:b,error:'fail'}]})});
 await assert.rejects(partial.fetchOfficial([a,b]),/DOCUMENT_FETCH_PARTIAL_FAILURE/);
});
test('one-source crosscheck cannot pass as two-source review',async()=>{
 const calls=[];const c=fake(calls);
 const e=new ResearchEngine({roster:bindDocumentResearchRoster(roster,['CHINA']),adapters:makeOfficialDocumentAdapters(c)});
 const result=await e.run({...job,sourceUrls:[a]});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.stage,'CROSS_CHECK_EVIDENCE');
});
test('unbound lanes remain blocked, original roster remains unchanged',async()=>{
 const bound=bindDocumentResearchRoster(roster,['CHINA']);
 assert.ok(bound.agents.filter(x=>x.lane==='CHINA').every(x=>x.executorBinding==='AUTHORIZED_TOOL_ADAPTER'));
 assert.ok(roster.agents.filter(x=>x.lane==='CHINA').every(x=>x.executorBinding===null));
 assert.ok(bound.agents.filter(x=>x.lane==='INDIA').every(x=>x.executorBinding===null));
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {Dispatcher,STAGES} from './dispatcher.mjs';
const agents=[{id:'#281102'},{id:'#88'},{id:'#1111'},{id:'#2222'},{id:'#55'},{id:'#5505'},{id:'#5515'}];
const assignments={SWARM:'#2222',SKIM:'#55',CROSS_CHECK:'#88',CODE:'#1111',TEST:'#5505',SAVE:'#281102',VERIFY:'#5515'};
const job={id:'agent-smoke-1',target:'authorized-test-target',assignments};
test('seven-stage command chain executes with stage receipts',async()=>{
 const adapters=Object.fromEntries(STAGES.map(stage=>[stage,async({job,agent})=>({ok:true,evidence:[job.id+':'+stage+':'+agent.id]})]));
 const dispatcher=new Dispatcher({agents,adapters,maxParallel:3});
 const result=await dispatcher.task(job);
 assert.equal(result.status,'VERIFIED');
 assert.deepEqual(dispatcher.events.map(e=>e.stage),STAGES);
 assert.ok(dispatcher.events.every(e=>e.status==='COMPLETED'));
 assert.equal(Object.keys(result.outputs).length,7);
});
test('missing adapter blocks execution instead of claiming success',async()=>{
 const dispatcher=new Dispatcher({agents,adapters:{},maxParallel:2});
 const result=await dispatcher.task(job);
 assert.equal(result.status,'BLOCKED');
 assert.equal(dispatcher.events[0].stage,'SWARM');
});
test('missing evidence fails closed',async()=>{
 const dispatcher=new Dispatcher({agents,adapters:{SWARM:async()=>({ok:true,evidence:[]})}});
 const result=await dispatcher.task(job);
 assert.equal(result.status,'FAILED');
});
test('batch respects assigned jobs and reports receipts',async()=>{
 const adapters=Object.fromEntries(STAGES.map(stage=>[stage,async()=>({ok:true,evidence:[stage]})]));
 const dispatcher=new Dispatcher({agents,adapters,maxParallel:2});
 const batch=await dispatcher.batch([job,{...job,id:'agent-smoke-2'}]);
 assert.deepEqual(batch.results.map(x=>x.status),['VERIFIED','VERIFIED']);
 assert.equal(batch.events.length,14);
});

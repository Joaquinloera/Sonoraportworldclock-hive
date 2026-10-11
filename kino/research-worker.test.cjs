'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createResearchWorker}=require('./research-worker.cjs');
const task={sourceUrl:'https://docs.github.com/en/apps'};
test('fetches approved official source',async()=>{const w=createResearchWorker({fetchPage:async()=>({text:'Official GitHub installation documentation',title:'GitHub Apps'}),allowedHosts:['docs.github.com']});const r=await w(task);assert.equal(r.review,'HUMAN_CROSS_CHECK_PENDING');assert.match(r.summary,/GitHub/)});
test('rejects unknown host',async()=>{const w=createResearchWorker({fetchPage:async()=>({text:'a'}),allowedHosts:['docs.github.com']});await assert.rejects(()=>w({sourceUrl:'https://evil.example/test'}),/Unapproved/)});
test('requires real fetch adapter',()=>assert.throws(()=>createResearchWorker({allowedHosts:['docs.github.com']}),/adapter/));
test('rejects empty responses',async()=>{const w=createResearchWorker({fetchPage:async()=>({text:''}),allowedHosts:['docs.github.com']});await assert.rejects(()=>w(task),/Empty/)});
test('rejects unbounded responses',async()=>{const w=createResearchWorker({fetchPage:async()=>({text:'x'.repeat(20)}),allowedHosts:['docs.github.com'],maxChars:10});await assert.rejects(()=>w(task),/limit/)});

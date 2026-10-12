'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SOURCES,parseDocument,makeOfficialResearchBatch}=require('./official-research-batch.cjs');
test('three division assignments',()=>assert.deepEqual(new Set(SOURCES.map(s=>s.agentId.split('-')[0])),new Set(['CENTCOM','CYBERCOM','SOUTHCOM'])));
test('TinyFish result shape maps to document',()=>assert.equal(parseDocument({results:[{url:'https://docs.github.com/en/apps',text:'Official docs',title:'GitHub'}]},'https://docs.github.com/en/apps').text,'Official docs'));
test('rejects mismatched source results',()=>assert.throws(()=>parseDocument({results:[]},'https://docs.github.com/en/apps'),/Unrecognized/));
test('batch processes three authorized official sources',async()=>{const q=makeOfficialResearchBatch({fetchContent:async url=>({results:[{url,text:'Official documentation content',title:'Verified source'}]})});await q.drain();assert.equal(q.snapshot().taskCount,3);assert.equal(q.snapshot().tasks.filter(t=>t.status==='EVIDENCE_COLLECTED').length,3)});
test('failed fetch does not fake completion',async()=>{const q=makeOfficialResearchBatch({fetchContent:async()=>{throw Error('Fetch unavailable')}});await q.drain();assert.equal(q.snapshot().tasks.filter(t=>t.status==='RETRY_PENDING').length,3)});

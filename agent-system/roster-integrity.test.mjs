import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const roster=JSON.parse(readFileSync(new URL('./sonoraport-144-agent-roster.json',import.meta.url),'utf8'));
const original=JSON.parse(readFileSync(new URL('./sonoraport-30-agent-roster.json',import.meta.url),'utf8'));
const stages=['DISCOVERY','API_AUTH_SKIM','SDK_ENDPOINT_SKIM','SECURITY_PERMISSIONS','CROSS_CHECK_EVIDENCE','INTEGRATION_TEST'];
test('144-agent roster has unique stable IDs and preserves original 30',()=>{
 assert.equal(roster.agents.length,144);
 assert.equal(new Set(roster.agents.map(a=>a.id)).size,144);
 assert.equal(original.agents.length,30);
 for(let i=0;i<30;i++) {assert.equal(roster.agents[i].id,original.agents[i].id);assert.equal(roster.agents[i].role,original.agents[i].role);}
});
test('19 regional banking lanes each have six specialist roles',()=>{
 assert.equal(roster.regionalLanes.length,19);
 for(const {id} of roster.regionalLanes){const agents=roster.agents.filter(x=>x.lane===id);assert.equal(agents.length,6,id);assert.deepEqual(new Set(agents.map(a=>a.workerRole)),new Set(stages));}
});
test('configured agent descriptions do not assert live provider connections',()=>{
 assert.equal(roster.status,'DEFINED_NOT_DEPLOYED');
 assert.ok(roster.agents.every(a=>a.execution_status==='NOT_VERIFIED_RUNNING'));
 assert.ok(roster.execution.max_parallel_workers<=8);
 assert.equal(roster.security.raw_credentials_in_registry,false);
 assert.equal(roster.security.no_production_funds_movement,true);
});
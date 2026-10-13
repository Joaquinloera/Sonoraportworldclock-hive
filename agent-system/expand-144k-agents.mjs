// SonoraPort 144K logical-agent expansion. Does not start or claim 144,000 live processes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
export const TARGET=144000;
export const LANES=Object.freeze(['GLOBAL_BANKS','BRICS_ALL_11','MEXICO','SOUTH_AMERICA','CARIBBEAN','AFRICA','ASIA_MIDDLE_EAST','PAYMENT_NETWORKS','BLOCKCHAIN','REAL_ESTATE','LEGAL','MATCHA_MANITA','INFRASTRUCTURE','SECURITY','WEBSITE','SUPABASE','NETLIFY','GITHUB','RESEARCH','QUALITY_ASSURANCE']);
export const STAGES=Object.freeze(['RECOVER','AI_AGENTS','SWARM','SKIM','CROSS_CHECK','CODE','TEST','SAVE','VERIFY']);
export function expandRoster(original,target=TARGET){
 if(!original||!Array.isArray(original.agents)||original.agents.length===0)throw Error('existing agent roster required');
 if(!Number.isSafeInteger(target)||target<original.agents.length||target>TARGET)throw RangeError('target outside allowed bounds');
 const ids=new Set(original.agents.map(a=>String(a.id)));
 if(ids.size!==original.agents.length)throw Error('duplicate original agent IDs');
 const agents=original.agents.map((a,i)=>({...a,ordinal:i+1,preserved:true}));
 for(let i=agents.length;i<target;i++){
  const id='SONORAPORT-LOGICAL-'+String(i+1).padStart(6,'0');
  if(ids.has(id))throw Error('agent ID collision');
  agents.push({id,ordinal:i+1,role:'SPECIALIST_LOGICAL_WORKER',lane:LANES[i%LANES.length],stage:STAGES[Math.floor(i/LANES.length)%STAGES.length],execution_status:'NOT_DEPLOYED',requires_evidence:true,preserved:false});
 }
 return {schema_version:'3.0.0',registry_name:'SONORAPORT_144K_LOGICAL_AGENTS',coordinator:original.coordinator,original_agent_count:original.agents.length,target_logical_agents:target,live_executors_verified:0,production_enabled:false,source:'agent-system/sonoraport-144-agent-roster.json',execution_policy:{mode:'definition_only',max_concurrent_live_jobs:0,requires_explicit_runtime_configuration:true,never_store_secrets_in_registry:true},agents};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=JSON.parse(readFileSync(resolve(here,'sonoraport-144-agent-roster.json'),'utf8'));
 const result=expandRoster(input);
 const output=process.argv[2];
 if(!output)throw Error('Pass an explicit output filename; existing files are never overwritten by default');
 writeFileSync(resolve(output),JSON.stringify(result));
 process.stdout.write(JSON.stringify({output:resolve(output),count:result.agents.length,live_executors_verified:0})+'\\n');
}

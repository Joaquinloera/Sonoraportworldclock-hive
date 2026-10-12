'use strict';
const fs=require('node:fs');
const {makeOfficialResearchBatch}=require('./official-research-batch.cjs');
async function main(){
 const file=process.argv[2];if(!file)throw Error('Usage: node kino/run-official-research.cjs fetched-documents.json');
 const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(raw.results))throw Error('Expected fetched-document results');
 const queue=makeOfficialResearchBatch({fetchContent:async url=>({results:raw.results.filter(x=>x.url===url||x.final_url===url)})});
 await queue.drain();const output=queue.snapshot();
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
 if(output.tasks.some(t=>t.status!=='EVIDENCE_COLLECTED'))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{process.stderr.write(String(e.message)+'\n');process.exitCode=1});
module.exports={main};

/** Enqueue only manifest-verified public bank research jobs. No bank credentials or transfers. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateQueuedResearchManifest} from './run-queued-official-doc-research.mjs';
import {SupabaseResearchQueue} from './supabase-job-store.mjs';

export async function enqueueApprovedBankResearch({queue,roster,manifest}) {
  const verified=validateQueuedResearchManifest(roster,manifest);
  if(!queue || typeof queue.enqueue!=='function') throw Error('QUEUE_REQUIRED');
  const results=[];
  for(const job of manifest.jobs){
    await queue.enqueue({id:job.id,lane:job.lane,provider:job.provider,intent:'PUBLIC_RESEARCH',sourceUrls:job.sourceUrls});
    results.push({id:job.id,lane:job.lane,queued:true});
  }
  return {approved:verified.approvedPublicResearchJobs,queued:results.length,results};
}
const isCLI=Boolean(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url);
if(isCLI){
  const [rosterPath,manifestPath,mode]=process.argv.slice(2);
  if(!rosterPath||!manifestPath||!['--validate-only','--enqueue-approved'].includes(mode)){
    console.error('Usage: node enqueue-approved-bank-research.mjs <roster.json> <manifest.json> --validate-only|--enqueue-approved');
    process.exitCode=2;
  }else{
    try{
      const roster=JSON.parse(readFileSync(rosterPath,'utf8'));
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      const verified=validateQueuedResearchManifest(roster,manifest);
      if(mode==='--validate-only')console.log(JSON.stringify({status:'VALIDATED',...verified}));
      else{
        if(process.env.SONORAPORT_RESEARCH_STAGING_APPROVED!=='true')throw Error('STAGING_APPROVAL_REQUIRED');
        const queue=new SupabaseResearchQueue({projectUrl:process.env.SONORAPORT_SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
        const result=await enqueueApprovedBankResearch({queue,roster,manifest});
        console.log(JSON.stringify({status:'ENQUEUED',approved:result.approved,queued:result.queued}));
      }
    }catch(e){console.error('BANK_RESEARCH_ENQUEUE_BLOCKED:',e.message);process.exitCode=1;}
  }
}

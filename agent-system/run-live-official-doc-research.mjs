/** CLI: authorized public official-document research using TinyFish Search/Fetch only. */
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {ResearchEngine} from './research-engine.mjs';
import {TinyFishDocumentClient,makeOfficialDocumentAdapters,bindDocumentResearchRoster} from './tinyfish-research-adapter.mjs';

export async function runOfficialDocumentJobs({roster,manifest,apiKey,fetchImpl}){
  if(!manifest||!Array.isArray(manifest.jobs)||!Array.isArray(manifest.allowedHosts))throw Error('MANIFEST_REQUIRED');
  const cliJobs=manifest.jobs.map(x=>({id:x.id,lane:x.lane,provider:x.provider,sourceUrls:x.sourceUrls,intent:'PUBLIC_RESEARCH'}));
  if(cliJobs.some(x=>x.sourceUrls?.length<2 || x.sourceUrls.length>10))throw Error('TWO_OFFICIAL_DOCS_REQUIRED');
  const copy=bindDocumentResearchRoster(roster,cliJobs.map(x=>x.lane));
  const client=new TinyFishDocumentClient({apiKey,allowedHosts:manifest.allowedHosts,fetchImpl});
  const engine=new ResearchEngine({roster:copy,adapters:makeOfficialDocumentAdapters(client),maxParallel:4});
  const results=await engine.runBatch(cliJobs);
  return {
    mode:'LIVE_TINYFISH_PUBLIC_DOCUMENT_FETCH_DETERMINISTIC_SKIM',
    logicalAgentsDefined:roster.agents.length,
    liveHostedAIAgentsDeployed:0,
    externalBankingConnectionsVerified:0,
    bankingTransfersInitiated:0,
    tasksAttempted:results.results.length,
    tasksResearchPipelinePassed:results.results.filter(x=>x.status==='RESEARCH_PIPELINE_PASSED').length,
    receipts:results.receipts.length,
    maxConcurrencyObserved:results.maxConcurrencyObserved,
    jobs:results.results.map(r=>({jobId:r.jobId,lane:r.lane??null,provider:r.provider??null,status:r.status,stage:r.stage??null,reason:r.reason??null,stageCount:Object.keys(r.outputs??{}).length,
      evidence: r.outputs?.DISCOVERY?.evidence?.map(e=>({url:e.url,contentSha256:e.contentSha256,acquisition:e.acquisition}))??[]}))
  };
}

const isCLI=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isCLI){
  const [rosterPath,manifestPath,resultPath,flag]=process.argv.slice(2);
  if(flag!=='--execute-public-research'||!rosterPath||!manifestPath||!resultPath){
    console.error('Usage: node run-live-official-doc-research.mjs <roster.json> <source-manifest.json> <new-output.json> --execute-public-research');
    process.exitCode=2;
  }else{
    try{
      const roster=JSON.parse(readFileSync(rosterPath,'utf8'));
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
      const report=await runOfficialDocumentJobs({roster,manifest,apiKey:process.env.TINYFISH_API_KEY});
      writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
      console.log(JSON.stringify({status:'RESEARCH_COMPLETED',tasksAttempted:report.tasksAttempted,tasksPassed:report.tasksResearchPipelinePassed,reportPath:resultPath}));
      if(report.tasksResearchPipelinePassed!==report.tasksAttempted)process.exitCode=1;
    }catch(e){console.error('RESEARCH_BLOCKED:',/^(MANIFEST_|TINYFISH_|TWO_OFFICIAL_DOCS_REQUIRED|UNKNOWN_LANE|EEXIST)/.test(e.message)?e.message:'VERIFICATION_OR_EXECUTION_FAILED');process.exitCode=1;}
  }
}
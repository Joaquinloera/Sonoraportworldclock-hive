import { readFileSync, writeFileSync } from 'node:fs';
import { ResearchEngine, makeReplayRoster, evidenceReplayAdapters } from './research-engine.mjs';

const [rosterPath, capturePath, outputPath] = process.argv.slice(2);
if (!rosterPath || !capturePath) {
  console.error('Usage: node run-evidence-replay.mjs <144-agent-roster.json> <official-source-captures.json> [output.json]');
  process.exitCode = 2;
} else {
  const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
  const bundle = JSON.parse(readFileSync(capturePath, 'utf8'));
  const captures = bundle.cases || [];
  const jobs = captures.map((caseRecord, i) => ({
    id: `public-research-${String(i+1).padStart(3,'0')}`,
    lane:caseRecord.lane, provider:caseRecord.provider, sourceUrls:[caseRecord.url], intent:'PUBLIC_RESEARCH'
  }));
  const copy = structuredClone(roster);
  const lanes = new Set(jobs.map(j=>j.lane));
  for(const lane of lanes) {
    const replay = makeReplayRoster(copy,lane);
    copy.agents = replay.agents;
  }
  const engine = new ResearchEngine({roster:copy, adapters:evidenceReplayAdapters(captures), maxParallel:8});
  const run = await engine.runBatch(jobs);
  const summary = {
    mode:'LOCAL_EVIDENCE_REPLAY_ONLY',
    hostedAgentsDeployed:false,
    liveBankingIntegrationsVerified:0,
    liveTinyFishBrowserAgentsUsed:0,
    logicalAgentsDefined:roster.agents.length,
    reviewedSourcePages:captures.length,
    receipts:run.receipts.length,
    maxConcurrencyObserved:run.maxConcurrencyObserved,
    results:run.results.map(r=>({jobId:r.jobId,lane:r.lane,provider:r.provider,status:r.status,stage:r.stage,reason:r.reason}))
  };
  if(outputPath) writeFileSync(outputPath,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  if(summary.results.some(x=>x.status!=='RESEARCH_REPLAY_PASSED')) process.exitCode=1;
}
/**
 * SonoraPort KINO research-worker execution engine (Node >=20).
 * Separate logical agent definitions from actual executor bindings. A 144-agent
 * roster alone does not mean 144 live workers.
 *
 * Supported workload: public / explicitly authorized documentary research.
 * No banking transactions, account access, secrets, or production deployments.
 */
import { createHash } from 'node:crypto';

export const RESEARCH_STAGES = Object.freeze([
  'DISCOVERY',
  'API_AUTH_SKIM',
  'SDK_ENDPOINT_SKIM',
  'SECURITY_PERMISSIONS',
  'CROSS_CHECK_EVIDENCE',
  'INTEGRATION_TEST',
]);

const FORBIDDEN_JOB_KEYS = /(?:secret|access_?token|refresh_?token|private_?key|api_?key|password|client_?secret|account_?number|routing_?number|balance_?usd)/i;
const MAX_EVIDENCE_ITEMS_PER_STEP = 32;
function assertNonsecret(value, path = 'input') {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNonsecret(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_JOB_KEYS.test(key)) throw Error(`Forbidden sensitive field at ${path}.${key}`);
      assertNonsecret(v, `${path}.${key}`);
    }
  }
}
function publicHttpsUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    // Do not fetch URLs from this engine; this is a metadata validity check.
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && !/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\]|.*\.local|.*\.internal)$/i.test(u.hostname)
      && !u.hostname.endsWith('.localhost');
  } catch { return false; }
}
function digest(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
function safeError(err) {
  // Never echo connector errors, which can include auth response bodies.
  return err instanceof ResearchBlocked ? err.code : 'ADAPTER_FAILED';
}
class ResearchBlocked extends Error {
  constructor(code) { super(code); this.code = code; }
}

export class ResearchEngine {
  constructor({ roster, adapters = {}, maxParallel = 8, onReceipt = () => {} }) {
    if (!roster || !Array.isArray(roster.agents) || !roster.agents.length) throw Error('Roster required');
    if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 8) throw Error('maxParallel must be 1..8');
    const ids = roster.agents.map(a => a.id);
    if (new Set(ids).size !== ids.length) throw Error('Duplicate logical agent IDs');
    if (typeof onReceipt !== 'function') throw Error('onReceipt must be a callback');
    this.agents = new Map(roster.agents.map(a => [a.id, a]));
    this.lanes = new Map((roster.regionalLanes ?? []).map(l => [l.id, l]));
    this.adapters = adapters;
    this.maxParallel = maxParallel;
    this.onReceipt = onReceipt;
    this.receipts = [];
    this.active = 0;
    this.highWater = 0;
  }

  receipt(data) {
    const safe = structuredClone(data);
    assertNonsecret(safe);
    const item = Object.freeze({ ...safe, digest: digest(safe) });
    this.receipts.push(item);
    this.onReceipt(item);
    return item;
  }

  resolveAgent(lane, stage) {
    if (!this.lanes.has(lane)) throw new ResearchBlocked('UNKNOWN_LANE');
    const matched = [...this.agents.values()].filter(a => a.lane === lane && a.workerRole === stage);
    if (matched.length !== 1) throw new ResearchBlocked('AGENT_ROLE_NOT_UNIQUE_OR_MISSING');
    return matched[0];
  }

  validateJob(job) {
    if (!job || typeof job !== 'object' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(job.id ?? '')) throw new ResearchBlocked('INVALID_JOB_ID');
    if (typeof job.provider !== 'string' || !job.provider.trim() || job.provider.length > 160) throw new ResearchBlocked('INVALID_PROVIDER');
    if (!this.lanes.has(job.lane)) throw new ResearchBlocked('UNKNOWN_LANE');
    if (!Array.isArray(job.sourceUrls) || job.sourceUrls.length < 1 || job.sourceUrls.length > 16 || !job.sourceUrls.every(publicHttpsUrl)) throw new ResearchBlocked('INVALID_SOURCE_URLS');
    if (job.intent !== 'PUBLIC_RESEARCH' && job.intent !== 'AUTHORIZED_DOCUMENTATION_RESEARCH') throw new ResearchBlocked('DISALLOWED_INTENT');
    assertNonsecret(job);
  }

  async run(job) {
    const startedAt = new Date().toISOString();
    const outputs = {};
    let stage = 'ASSIGN';
    let workerId = null;
    try {
      this.validateJob(job);
      this.receipt({jobId: job.id, stage, status: 'STARTED', at: startedAt, lane: job.lane, provider: job.provider});
      for (stage of RESEARCH_STAGES) {
        const agent = this.resolveAgent(job.lane, stage);
        workerId = agent.id;
        const adapter = this.adapters[stage];
        // Unbound logical agents are NOT runnable unless explicitly attached to a real adapter.
        if (typeof adapter !== 'function' || typeof agent.executorBinding !== 'string' || agent.executorBinding.length === 0) {
          throw new ResearchBlocked('EXECUTOR_NOT_BOUND');
        }
        if (!['LOCAL_EVIDENCE_REPLAY', 'AUTHORIZED_TOOL_ADAPTER'].includes(agent.executorBinding)) throw new ResearchBlocked('EXECUTOR_BINDING_NOT_ALLOWED');
        this.receipt({jobId:job.id, stage, workerId, status:'STARTED', at:new Date().toISOString()});
        const result = await adapter({job:structuredClone(job),agent:structuredClone(agent),stage,outputs:structuredClone(outputs)});
        if (result?.ok !== true || !Array.isArray(result.evidence) || result.evidence.length === 0 || result.evidence.length > MAX_EVIDENCE_ITEMS_PER_STEP) {
          throw new ResearchBlocked('NO_VERIFIABLE_EVIDENCE');
        }
        assertNonsecret(result);
        for (const e of result.evidence) {
          if (!e || !publicHttpsUrl(e.url) || !job.sourceUrls.includes(e.url)
            || !['PUBLIC_OFFICIAL_DOCUMENT','PUBLIC_REPOSITORY_DOCUMENT','AUTHORIZED_PARTNER_DOCUMENT'].includes(e.kind)
            || !['FETCHED','IMPORTED_OFFICIAL_SOURCE'].includes(e.acquisition)) throw new ResearchBlocked('INVALID_EVIDENCE');
        }
        // Persist only bounded structured metadata; never raw pages or secrets.
        outputs[stage] = {ok:true,findings:result.findings ?? {}, evidence:result.evidence};
        this.receipt({jobId:job.id,stage,workerId,status:'COMPLETED',at:new Date().toISOString(),evidenceCount:result.evidence.length,evidenceDigest:digest(result.evidence)});
      }
      const replay = RESEARCH_STAGES.every(s => this.resolveAgent(job.lane,s).executorBinding === 'LOCAL_EVIDENCE_REPLAY');
      const status = replay ? 'RESEARCH_REPLAY_PASSED' : 'RESEARCH_PIPELINE_PASSED';
      this.receipt({jobId:job.id,stage:'FINISH',status,at:new Date().toISOString()});
      return {jobId:job.id,status,provider:job.provider,lane:job.lane,outputs};
    } catch (error) {
      const reason = safeError(error);
      this.receipt({jobId: typeof job?.id === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(job.id) ? job.id : 'INVALID',stage,workerId,status:'BLOCKED',reason,at:new Date().toISOString()});
      return {jobId:job?.id ?? null,status:'BLOCKED',stage,reason,outputs};
    }
  }

  async runBatch(jobs) {
    if (!Array.isArray(jobs) || jobs.length > 144000) throw Error('Invalid job batch size');
    const ids = jobs.map(j => j?.id);
    if (new Set(ids).size !== ids.length) throw Error('Duplicate jobs');
    const results = new Array(jobs.length);
    let cursor = 0;
    await Promise.all(Array.from({length:Math.min(jobs.length,this.maxParallel)},async () => {
      while (cursor < jobs.length) {
        const index = cursor++;
        this.active++;
        this.highWater = Math.max(this.highWater,this.active);
        try { results[index] = await this.run(jobs[index]); }
        finally { this.active--; }
      }
    }));
    return {results,receipts:this.receipts.slice(),maxConcurrencyObserved:this.highWater};
  }
}

/** Bind replay-only adapters to copies of roles; never alter committed roster status. */
export function makeReplayRoster(roster,lane) {
  const copy = structuredClone(roster);
  if (!copy.regionalLanes?.some(x=>x.id===lane)) throw Error('Unknown replay lane');
  for (const a of copy.agents) if (a.lane===lane && RESEARCH_STAGES.includes(a.workerRole)) a.executorBinding='LOCAL_EVIDENCE_REPLAY';
  return copy;
}

/**
 * Deterministic local evidence adapter. Research is re-processed from documented
 * official source captures, NOT live retrieval or actual third-party AI calls.
 */
export function evidenceReplayAdapters(captures) {
  const adapter=async ({job,stage})=>{
    const capture=captures.find(c=>c.provider===job.provider && c.lane===job.lane);
    if (!capture || !capture.url || !job.sourceUrls.includes(capture.url) || capture.status!=='OFFICIAL_PAGE_FETCHED') return {ok:false,evidence:[]};
    return {
      ok:true,
      evidence:[{url:capture.url,kind:'PUBLIC_OFFICIAL_DOCUMENT',acquisition:'IMPORTED_OFFICIAL_SOURCE',title:capture.title,checkedDate:capture.checkedDate}],
      findings:{stage,sourceTitle:capture.title,scope:'PUBLIC_RESEARCH_ONLY',apiCredentials:'NOT_OBTAINED',bankAccountAccess:false,productionConnected:false,notes:capture.findings?.[stage] ?? 'No verified technical detail extracted for this stage'},
    };
  };
  return Object.fromEntries(RESEARCH_STAGES.map(stage=>[stage,adapter]));
}
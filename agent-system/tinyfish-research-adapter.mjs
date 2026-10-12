/**
 * SonoraPort KINO #281102 authorized TinyFish Search + Fetch bridge (Node 22+).
 * Real public-document retrieval, deterministic keyword skimming, and evidence.
 * Not hosted LLM agents, live banking services, or a paid TinyFish Agent run.
 * Official contract: https://docs.tinyfish.ai/search-api and /fetch-api
 */
import {createHash} from 'node:crypto';
import {RESEARCH_STAGES} from './research-engine.mjs';

const MAX_PAGE_CHARS = 240000;
const DETECT = Object.freeze({
  DISCOVERY: ['bank','banking','payment','financial','participant','participation','service','platform'],
  API_AUTH_SKIM: ['oauth','api key','api-key','token','certificate','authentication','authorization','register','onboard','access'],
  SDK_ENDPOINT_SKIM: ['api','sdk','openapi','rest','graphql','webhook','endpoint','developer','integration'],
  SECURITY_PERMISSIONS: ['permission','scope','authorization','security','participant','license','certificate','restricted','regulat'],
  CROSS_CHECK_EVIDENCE: ['document','official','rule','guideline','requirement','member','participation'],
  INTEGRATION_TEST: ['sandbox','test','simulation','environment','developer','production']
});
const sha256=s=>createHash('sha256').update(s).digest('hex');
function checkUrl(value, allowedHosts){
  if(typeof value!=='string'||value.length>1900) throw Error('UNTRUSTED_DOCUMENT_URL');
  let u;try{u=new URL(value)}catch{throw Error('UNTRUSTED_DOCUMENT_URL')}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!/^[a-z0-9.-]+$/i.test(u.hostname)||!allowedHosts.has(u.hostname.toLowerCase())) throw Error('UNTRUSTED_DOCUMENT_URL');
  for(const [k] of u.searchParams)if(/token|api.?key|secret|password|auth|session|credential|signature/i.test(k)) throw Error('SENSITIVE_URL_QUERY');
  return u.href;
}
function hosts(values){
  if(!Array.isArray(values)||values.length<1||values.length>30) throw Error('OFFICIAL_HOST_ALLOWLIST_REQUIRED');
  const s=new Set();for(const x of values){if(typeof x!=='string'||!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i.test(x)||x.endsWith('.local')||x.endsWith('.internal'))throw Error('INVALID_ALLOWLIST_HOST');s.add(x.toLowerCase())}return s;
}
function boundedJSON(s){if(s.length>2_000_000)throw Error('DOCUMENT_API_RESPONSE_OVERSIZE');try{return JSON.parse(s)}catch{throw Error('DOCUMENT_API_RESPONSE_NOT_JSON')}}
const safeError=()=>Error('TINYFISH_DOCUMENT_REQUEST_FAILED');
export class TinyFishDocumentClient {
  #key;
  constructor({apiKey,fetchImpl=fetch,allowedHosts}){
    if(typeof apiKey!=='string'||apiKey.length<8)throw Error('TINYFISH_SERVER_KEY_REQUIRED');
    if(typeof fetchImpl!=='function')throw Error('FETCH_FUNCTION_REQUIRED');
    this.#key=apiKey;this.fetchImpl=fetchImpl;this.allowedHosts=hosts(allowedHosts);
  }
  async #request(url, init){
    let resp;try{resp=await this.fetchImpl(url,{...init,headers:{'X-API-Key':this.#key,...(init?.headers??{})},signal:AbortSignal.timeout(35000),redirect:'error'})}catch{throw safeError()}
    if(!resp?.ok)throw safeError();
    let body;try{body=await resp.text()}catch{throw safeError()}
    return boundedJSON(body);
  }
  async searchOfficial(query){
    if(typeof query!=='string'||!query.trim()||query.length>2000)throw Error('SEARCH_QUERY_INVALID');
    const url=new URL('https://api.search.tinyfish.ai');url.searchParams.set('query',query);
    const result=await this.#request(url.href,{method:'GET'});
    return (Array.isArray(result.results)?result.results:[]).slice(0,20).filter(x=>{
      try{checkUrl(x.url,this.allowedHosts);return true}catch{return false}
    }).map(x=>({title:String(x.title??'').slice(0,160),url:x.url,sourceType:'SEARCH_LEAD_NOT_FETCHED'}));
  }
  async fetchOfficial(urls){
    if(!Array.isArray(urls)||urls.length<1||urls.length>10)throw Error('FETCH_URL_COUNT_INVALID');
    const validated=urls.map(x=>checkUrl(x,this.allowedHosts));
    if(new Set(validated).size!==validated.length)throw Error('DUPLICATE_URLS');
    const body=await this.#request('https://api.fetch.tinyfish.ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:validated,format:'markdown',ttl:0})});
    const failures=Array.isArray(body.errors)?body.errors:[];
    if(failures.length)throw Error('DOCUMENT_FETCH_PARTIAL_FAILURE');
    if(!Array.isArray(body.results)||body.results.length!==validated.length)throw Error('DOCUMENT_FETCH_INCOMPLETE');
    const pages=[];
    for(const x of body.results){
      if(!validated.includes(x.url)||typeof x.text!=='string'||x.text.length<80||x.text.length>MAX_PAGE_CHARS)throw Error('DOCUMENT_FETCH_UNUSABLE');
      checkUrl(x.final_url??x.url,this.allowedHosts);
      if(x.final_url && new URL(x.final_url).hostname!==new URL(x.url).hostname)throw Error('DOCUMENT_REDIRECTED_HOST');
      if(pages.some(v=>v.url===x.url))throw Error('DUPLICATE_DOCUMENT_RESULT');
      pages.push({url:x.url,title:String(x.title??'Untitled').slice(0,160),body:x.text,sha256:sha256(x.text)});
    }
    return pages;
  }
}

function clipped(text, needle){
  const at=text.toLowerCase().indexOf(needle);
  if(at<0)return null;
  const out=text.slice(Math.max(0,at-65),Math.min(text.length,at+needle.length+90)).replace(/\s+/g,' ').trim();
  // Avoid leaking even incidental credential/account values from public pages.
  if(/(?:sk-[a-z0-9_-]{12}|api[_ -]?key\s*[:=]\s*\S{8}|bearer\s+[a-z0-9_-]{12}|\b\d{13,19}\b)/i.test(out))return null;
  return out.slice(0,165);
}
/** One vetted job needs two independently fetched URL sources to cross-check. */
export function makeOfficialDocumentAdapters(client){
  if(!(client instanceof TinyFishDocumentClient))throw Error('TINYFISH_CLIENT_REQUIRED');
  const docs=new Map();
  async function adapter({job,stage}){
    const k=String(job.id)+':'+job.sourceUrls.join('|');
    if(!RESEARCH_STAGES.includes(stage))throw Error('STAGE_UNSUPPORTED');
    let pages=docs.get(k);
    if(!pages){
      if(stage!=='DISCOVERY')throw Error('DISCOVERY_REQUIRED_FIRST');
      if(docs.size>=32)throw Error('DOCUMENT_CACHE_CAPACITY_EXCEEDED');
      pages=await client.fetchOfficial(job.sourceUrls);
      docs.set(k,pages);
    }
    if(stage==='CROSS_CHECK_EVIDENCE' && new Set(pages.map(p=>new URL(p.url).hostname)).size<2) {
      // Distinct URLs on the SAME website are different documents, not independent institutions.
      // Two documents can support cross-checking text, not independent institutional verification.
      if(pages.length<2) {docs.delete(k);return {ok:false,evidence:[]};}
    }
    const needles=DETECT[stage];
    const summaries=pages.map(p=>{
      const signals=needles.filter(w=>p.body.toLowerCase().includes(w)).slice(0,8);
      return {url:p.url,contentSha256:p.sha256,keywordSignals:signals,excerpts:signals.map(s=>clipped(p.body,s)).filter(Boolean).slice(0,3)};
    });
    if(stage==='INTEGRATION_TEST')docs.delete(k);
    return {
      ok:true,
      evidence:pages.map(p=>({url:p.url,kind:'PUBLIC_OFFICIAL_DOCUMENT',acquisition:'FETCHED',contentSha256:p.sha256,title:p.title})),
      findings:{stage,kind:'DETERMINISTIC_KEYWORD_SKIM_NOT_LLM',scope:'OFFICIAL_PUBLIC_DOCS_ONLY',pages:summaries,officialInstitutionalAccessVerified:false,
        developerEndpointVerified:false,sandboxAuthorized:false,financialOperation:false,
        crossCheckLevel:stage==='CROSS_CHECK_EVIDENCE'?'TWO_PUBLIC_DOCUMENTS_NOT_INDEPENDENT_PROVIDER_AUTHORIZATION':'NOT_APPLICABLE'}
    };
  }
  return Object.fromEntries(RESEARCH_STAGES.map(s=>[s,adapter]));
}

/** Bind only real tool adapters in a transient roster; never mutate committed agent state. */
export function bindDocumentResearchRoster(roster,lanes){
  if(!roster?.agents||!roster?.regionalLanes)throw Error('ROSTER_REQUIRED');
  const s=new Set(lanes);const known=new Set(roster.regionalLanes.map(x=>x.id));
  if(!s.size||[...s].some(x=>!known.has(x)))throw Error('UNKNOWN_LANE');
  const copy=structuredClone(roster);
  for(const agent of copy.agents)if(s.has(agent.lane)&&RESEARCH_STAGES.includes(agent.workerRole))agent.executorBinding='AUTHORIZED_TOOL_ADAPTER';
  return copy;
}
'use strict';
const {createResearchWorker}=require('./research-worker.cjs');
const {SwarmQueue}=require('./swarm-queue.cjs');
const SOURCES=Object.freeze([
 {agentId:'CENTCOM-02',repository:'Joaquinloera/Sonoraportworldclock-hive',provider:'GitHub Apps',sourceUrl:'https://docs.github.com/en/apps/using-github-apps/about-using-github-apps',objective:'Extract installation scope and app permissions'},
 {agentId:'CYBERCOM-02',repository:'Joaquinloera/sonoraport-banking',provider:'Supabase RLS',sourceUrl:'https://supabase.com/docs/guides/database/postgres/row-level-security',objective:'Review RLS access rules and service credentials'},
 {agentId:'SOUTHCOM-06',repository:'Joaquinloera/sonoraport-banking',provider:'Stripe webhooks',sourceUrl:'https://docs.stripe.com/webhooks',objective:'Extract webhook signature verification requirements'}
]);
function parseDocument(data,url){if(typeof data==='string')return {text:data,title:url};if(data&&typeof data.text==='string')return {text:data.text,title:data.title||url};if(data&&Array.isArray(data.results)){const item=data.results.find(x=>x.url===url||x.final_url===url);if(item)return {text:item.text,title:item.title||url}}throw Error('Unrecognized fetch result')}
function makeOfficialResearchBatch({fetchContent}={}){if(typeof fetchContent!=='function')throw Error('fetchContent required');const fetchPage=async url=>parseDocument(await fetchContent(url),url);const worker=createResearchWorker({fetchPage,allowedHosts:['docs.github.com','supabase.com','docs.stripe.com']});const queue=new SwarmQueue({worker,maxAttempts:2});for(const task of SOURCES)queue.enqueue(task);return queue}
module.exports={SOURCES,parseDocument,makeOfficialResearchBatch};

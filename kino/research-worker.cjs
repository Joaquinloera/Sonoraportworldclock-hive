'use strict';
function createResearchWorker({fetchPage,allowedHosts=[],maxChars=16000}={}){
 if(typeof fetchPage!=='function')throw Error('fetchPage adapter required');
 if(!Array.isArray(allowedHosts)||!allowedHosts.length)throw Error('Explicit allowlist required');
 return async task=>{
  const url=new URL(task.sourceUrl);
  if(url.protocol!=='https:'||!allowedHosts.includes(url.hostname))throw Error('Unapproved source host');
  const page=await fetchPage(url.href,{timeoutMs:15000});
  if(!page||typeof page.text!=='string'||!page.text.trim())throw Error('Empty source content');
  if(page.text.length>maxChars)throw Error('Source exceeds review limit');
  const summary=page.text.replace(/\s+/g,' ').trim().slice(0,1200);
  return {sourceUrl:url.href,summary,sourceTitle:String(page.title||'').slice(0,200),sourceType:'FETCHED_DOCUMENT',review:'HUMAN_CROSS_CHECK_PENDING'};
 };
}
module.exports={createResearchWorker};

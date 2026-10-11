'use strict';
const {queueAssignment,attachResearch}=require('./agent-orchestrator.cjs');
const TERMINAL=new Set(['EVIDENCE_COLLECTED','FAILED']);
class SwarmQueue {
 constructor({worker,maxAttempts=3,clock=()=>new Date().toISOString()}={}) {if(typeof worker!=='function')throw Error('Worker function required');if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw Error('Invalid retry limit');this.worker=worker;this.maxAttempts=maxAttempts;this.clock=clock;this.tasks=new Map();this.events=[];}
 enqueue(input){const task=queueAssignment(input);if(!this.tasks.has(task.id)){this.tasks.set(task.id,{...task,attempts:0});this.log(task.id,'QUEUED_NOT_EXECUTED')}return this.tasks.get(task.id)}
 log(id,status,details){this.events.push({id,status,at:this.clock(),...(details?{details}:{} )})}
 async process(id){const task=this.tasks.get(id);if(!task)throw Error('Unknown task');if(TERMINAL.has(task.status))return task;if(task.status==='RUNNING')throw Error('Already running');task.status='RUNNING';task.attempts++;this.log(id,'RUNNING');try{const evidence=await this.worker(Object.freeze({...task}));if(!evidence||typeof evidence.sourceUrl!=='string'||typeof evidence.summary!=='string')throw Error('Worker returned no evidence');const completed=attachResearch({...task,status:'QUEUED_NOT_EXECUTED'},evidence);Object.assign(task,completed,{status:'EVIDENCE_COLLECTED',execution:'WORKER_RETURNED_EVIDENCE'});this.log(id,task.status,{sourceUrl:evidence.sourceUrl});return task}catch(error){task.status=task.attempts>=this.maxAttempts?'FAILED':'RETRY_PENDING';this.log(id,task.status,{message:String(error.message||error).slice(0,200)});return task}}
 async drain({limit=10}={}){if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid limit');const processed=[];for(const task of this.tasks.values()){if(processed.length>=limit)break;if(task.status==='QUEUED_NOT_EXECUTED'||task.status==='RETRY_PENDING')processed.push(await this.process(task.id))}return processed}
 snapshot(){return {operation:'KINO-281102',taskCount:this.tasks.size,tasks:Array.from(this.tasks.values()).map(t=>({...t})),events:this.events.map(e=>({...e}))}}
}
module.exports={SwarmQueue};

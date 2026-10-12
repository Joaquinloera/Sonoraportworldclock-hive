// SonoraPort SWARM+SKIM execution core. Adapters must be authorized and supply evidence.
export const STAGES=['SWARM','SKIM','CROSS_CHECK','CODE','TEST','SAVE','VERIFY'];
export class Dispatcher {
  constructor({agents,adapters,maxParallel=8}) {
    if(!Array.isArray(agents)||new Set(agents.map(a=>a.id)).size!==agents.length) throw Error('Invalid roster');
    if(!Number.isInteger(maxParallel)||maxParallel<1||maxParallel>8) throw Error('Concurrency must be 1..8');
    this.agents=new Map(agents.map(a=>[a.id,a]));
    this.adapters=adapters||{};
    this.maxParallel=maxParallel;
    this.events=[];
  }
  async task(job) {
    if(!job?.id||!job?.target||!job?.assignments) throw Error('Invalid job');
    const outputs={};
    for(const stage of STAGES) {
      const agent=this.agents.get(job.assignments[stage]), adapter=this.adapters[stage];
      if(!agent||typeof adapter!=='function') {
        this.events.push({job:job.id,stage,status:'BLOCKED'});
        return {id:job.id,status:'BLOCKED',outputs};
      }
      this.events.push({job:job.id,stage,agent:agent.id,status:'RUNNING'});
      try {
        const result=await adapter({job,agent,stage,outputs});
        if(result?.ok!==true||!Array.isArray(result.evidence)||result.evidence.length===0) throw Error('Missing evidence');
        outputs[stage]=result;
        this.events.push({job:job.id,stage,agent:agent.id,status:'COMPLETED'});
      } catch(e) {
        this.events.push({job:job.id,stage,agent:agent.id,status:'FAILED',reason:String(e.message)});
        return {id:job.id,status:'FAILED',outputs};
      }
    }
    return {id:job.id,status:'VERIFIED',outputs};
  }
  async batch(jobs) {
    if(!Array.isArray(jobs)||new Set(jobs.map(j=>j.id)).size!==jobs.length) throw Error('Duplicate jobs');
    let next=0;
    const results=Array(jobs.length);
    await Promise.all(Array.from({length:Math.min(this.maxParallel,jobs.length)},async()=>{
      while(next<jobs.length){const i=next++;results[i]=await this.task(jobs[i]);}
    }));
    return {results,events:this.events};
  }
}

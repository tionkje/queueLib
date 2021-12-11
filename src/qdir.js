const assert = (pred,msg='Assertion Failed')=>{ if(!pred) { console.error(msg); debugger; throw new Error(msg); } }
class Action { 
  _finished = false;
  get finished(){return this._finished;}

  _started = false;
  get started(){return this._started;}

  _executor;
  get executor(){return this._executor;}

  get type(){throw new Error('Not implemented')}

  constructor(executor){
    this._executor = executor;
  }
}
export class ProduceAction extends Action {
  _time;
  _producing;

  get timeLeft(){ return this._time; }
  get totalTime(){ return this._totalTime; }
  get producing(){ return this._producing; }
  get type(){return 'ProduceAction'}

  constructor(producer, time, result){
    super(producer);
    this._totalTime = time;
    this._time = time;
    this._producing = result;
  }

  evaluate(dt){
    if(this._finished) return;
    if(dt>0) this._started = true;
    if(this._time > dt){
      this._time -= dt;
      dt = 0;
    }else{
      dt -= this._time;
      this._time = 0;
      this._finished = true;
      this._producing._paused = false;
      dt = this._producing.evaluate(dt);
    }
    return dt;
  }

}

class Producer {
  _dir;
  _paused = true;
  _actionQueue = [];
  id;
  
  get paused(){return this._paused;}
  get head(){return this._actionQueue[0]; }
  get actionQueue(){return this._actionQueue.slice();}

  constructor(dir, id){
    this._dir = dir;
    this.id = id;
  }

  enqueueProduceAction(time){
    const p = this._dir.createProducer();

    const a = new ProduceAction(this, time, p);
    this.pushAction(a);

    p.produceAction = a;

    return p;
  }

  pushAction(a){
    assert(a instanceof Action, 'action should be of type Action');
    this._actionQueue.push(a);
  }

  cancelAction(a){
    this._dir.removeProducer(a.producing);
    const idx = this._actionQueue.indexOf(a);
    if(idx<0) return console.error(`Producer.cancelAction: action not found`, p);
    this._actionQueue.splice(idx, 1);
  }

  evaluate(dt){
    if(this._paused) return;
    let head;
    do {
      // console.log(this._actionQueue);
      head = this.head;
      if(!head) break;
      if(head.finished) {
        this._actionQueue.shift();
        continue;
      }
      dt = head.evaluate(dt);
    } while(dt>0 || head.finished)
    return dt;
  }
}

export class Manager{
  _producers = [];
  _nextId = 0;

  get producers(){ return this._producers.slice().sort((a,b)=>a.id-b.id); }

  createUnpausedProducer(){
    return this.createProducer(false);
  }
  createProducer(paused=true){
    const p = new Producer(this, ++this._nextId);

    this._producers.push(p);

    p._paused = paused;
    return p;
  }

  removeProducer(p){
    p.actionQueue.forEach(a=>p.cancelAction(a));
    const idx = this._producers.indexOf(p);
    if(idx<0) return console.error(`Manager.removeProducer: producer not found`, p);
    this._producers.splice(idx,1);
  }

  evaluate(dt){
    this._producers.sort((a,b)=>{
      if(!!b._paused         != !!a._paused)         return !!b.paused          - !!a._paused;
      if(!!a._actionQueue[0] != !!b._actionQueue[0]) return !!a._actionQueue[0] - !!b._actionQueue[0];
      if(!a._actionQueue[0] && !b._actionQueue[0]) return 0;
      return a._actionQueue[0]._time - b._actionQueue[0]._time;
    });
    // console.log(this._producers);
    this._producers.forEach(p=>p.evaluate(dt));
  }
}

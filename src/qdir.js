import { strict as assert } from 'assert';

class Action { 
  _finished = false;
}
export class ProduceAction extends Action {
  _time;
  _result;

  get timeLeft(){ return this._time; }

  constructor(time, result){
    super();
    this._time = time;
    this._result = result;
  }

  evaluate(dt){
    if(this._finished) return;
    if(this._time > dt){
      this._time -= dt;
      dt = 0;
    }else{
      dt -= this._time;
      this._time = 0;
      this._finished = true;
      this._result._paused = false;
      dt = this._result.evaluate(dt);
    }
    return dt;
  }
}

class Producer {
  _dir;
  _paused = true;
  _actionQueue = [];
  
  get paused(){return this._paused;}
  get head(){return this._actionQueue[0]; }

  constructor(dir){
    this._dir = dir;
  }

  enque(newAction){
    const p = new Producer(this._dir);
    this._dir._producers.push(p);

    const a = newAction(p)
    this.pushAction(a);

    return p;
  }

  pushAction(a){
    assert(a instanceof Action, 'action should be of type Action');
    this._actionQueue.push(a);
  }

  evaluate(dt){
    if(this._paused) return;
    let head;
    do {
      // console.log(this._actionQueue);
      head = this._actionQueue[0];
      if(!head) break;
      if(head._finished) {
        this._actionQueue.shift();
        continue;
      }
      dt = head.evaluate(dt);
    } while(dt>0 || head._finished)
    return dt;
  }
}

export class Manager{
  _producers = [];

  get producers(){ return this._producers.slice(); }

  createProducer(){
    const p = new Producer(this);
    p._paused = false;

    this._producers.push(p);

    return p;
  }

  evaluate(dt){
    this._producers.sort((a,b)=>{
      if(!!b._paused         != !!a._paused)         return !!b.paused          - !!a._paused;
      if(!!a._actionQueue[0] != !!b._actionQueue[0]) return !!a._actionQueue[0] - !!b._actionQueue[0];
      return a._actionQueue[0]._time - b._actionQueue[0]._time;
    });
    // console.log(this._producers);
    this._producers.forEach(p=>p.evaluate(dt));

  }
}

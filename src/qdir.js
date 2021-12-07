const assert = (pred,msg='Assertion Failed')=>{ if(!pred) { console.error(msg); debugger; throw new Error(msg); } }
class Action { 
  _finished = false;
}
export class ProduceAction extends Action {
  _time;
  _result;

  get timeLeft(){ return this._time; }
  get id(){ return this._result.id; }

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
  id;
  
  get paused(){return this._paused;}
  get head(){return this._actionQueue[0]; }
  get actionQueue(){return this._actionQueue.slice();}

  constructor(dir, id){
    this._dir = dir;
    this.id = id;
  }

  enque(newAction){
    const p = new Producer(this._dir, ++this._dir._nextId);
    this._dir._producers.push(p);

    const a = newAction(p)
    this.pushAction(a);

    return p;
  }

  pushAction(a){
    assert(a instanceof Action, 'action should be of type Action');
    this._actionQueue.push(a);
  }

  cancelAction(a){
    this._dir.removeProducer(a._result);
    const idx = this._actionQueue.indexOf(a);
    if(idx<0) return console.error(`Producer.cancelAction: action not found`, p);
    this._actionQueue.splice(idx, 1);
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
  _nextId = 0;

  get producers(){ return this._producers.slice(); }

  createProducer(){
    const p = new Producer(this, ++this._nextId);
    p._paused = false;

    this._producers.push(p);

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
      return a._actionQueue[0]._time - b._actionQueue[0]._time;
    });
    // console.log(this._producers);
    this._producers.forEach(p=>p.evaluate(dt));
  }
}

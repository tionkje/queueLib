const assert = (pred, msg = 'Assertion Failed') => {
  if (!pred) {
    console.error(msg);
    debugger;
    throw new Error(msg);
  }
};

class Action {
  _finished = false;
  _started = false;
  _producer;

  constructor(producer) {
    this._producer = producer;
  }

  get producer() {
    return this._producer;
  }
  get finished() {
    return this._finished;
  }
  get started() {
    return this._started;
  }
  get type() {
    throw new Error('Not implemented');
  }

  evaluate() {
    throw new Error('Not implemented');
  }

  toJSON() {
    const result = Object.assign({}, this);
    result.type = this.type;
    delete result._producer;
    return result;
  }
  revive(src) {
    this._started = src._started;
    this._finished = src._finished;
  }
}

class LockAction extends Action {
  _predicate;
  get locked() {
    return this._predicate();
  }
  get type() {
    return 'LockAction';
  }
  constructor(producer, pred) {
    super(producer);
    this._predicate = pred;
  }
  evaluate(dt) {
    if (this._finished) return dt;
    this._started = true;
    if (this._predicate()) return 0;
    this._finished = true;
    return dt;
  }
  toJSON() {
    throw new Error('Not Implemented');
  }
  revive() {
    throw new Error('Not Implemented');
  }
}

class WaitAction extends Action {
  _time;
  _totalTime;
  _onDone;

  get timeLeft() {
    return this._time;
  }
  get totalTime() {
    return this._totalTime;
  }
  get type() {
    return 'WaitAction';
  }

  constructor(producer, time, onDone) {
    super(producer);
    this._onDone = onDone;
    this._totalTime = time;
    this._time = time;
  }

  evaluate(dt) {
    if (this._finished) return dt;
    this._started = true;
    if (this._time > dt) {
      this._time -= dt;
      dt = 0;
    } else {
      dt -= this._time;
      this._time = 0;
      this._finished = true;
      const res = this._onDone(dt);
      if (typeof res == 'number') dt = res;
    }
    return dt;
  }
  toJSON() {
    const result = super.toJSON();
    return result;
  }
  revive(src) {
    super.revive(src);
    this._time = src._time;
    this._totalTime = src._totalTime;
  }
}

class ProduceAction extends WaitAction {
  _producing;

  get producing() {
    return this._producing;
  }
  get type() {
    return 'ProduceAction';
  }

  constructor(producer, time, producing) {
    super(producer, time, (dt) => {
      this._producing._paused = false;
      return this._producing.evaluate(dt);
    });
    this._producing = producing;
    this._producing.produceAction = this;
  }

  toJSON() {
    const result = super.toJSON();
    result._producing = result._producing.id;
    return result;
  }
  revive(src) {
    super.revive(src);
    this._producing.produceAction = this;
  }
}

class CompoundAction extends Action {
  _actions;

  get actions() {
    return this._actions.slice();
  }
  get type() {
    return 'CompoundAction';
  }
  constructor(producer, actions) {
    super(producer);
    this._actions = actions;
  }
  evaluate(dt) {
    if (this._finished) return dt;
    this._started = true;

    dt = evaluateActions(dt, this._actions);
    if (this._actions.length == 0) this._finished = true;
    return dt;
  }

  toJSON() {
    throw new Error('Not Implemented');
  }
  revive() {
    throw new Error('Not Implemented');
  }
}

class Producer {
  _dir;
  _paused = true;
  _actionQueue = [];
  _id;
  produceAction; // action that created this Producer

  get paused() {
    return this._paused;
  }
  get head() {
    return this._actionQueue[0];
  }
  get actionQueue() {
    return this._actionQueue.slice();
  }
  get id() {
    return this._id;
  }

  constructor(dir, id) {
    this._dir = dir;
    this._id = id;
  }

  enqueueProduceAction(time) {
    return this.enqueueAction('ProduceAction', time);
  }
  enqueueWaitAction(time, done) {
    return this.enqueueAction('WaitAction', time, done);
  }
  enqueueLockAction(pred) {
    return this.enqueueAction('LockAction', pred);
  }

  _createAction(type, ...args) {
    switch (type) {
      case 'ProduceAction':
        return new ProduceAction(this, ...args, this._dir.createProducer());
      case 'WaitAction':
        return new WaitAction(this, ...args);
      case 'LockAction':
        return new LockAction(this, ...args);
      case 'CompoundAction':
        return new CompoundAction(this, ...args);
      case 'PredProduceAction':
        const [pred, time] = args;
        return new CompoundAction(this, [
          new LockAction(this, pred),
          new ProduceAction(this, time, this._dir.createProducer())
        ]);
      default:
        throw new Error(`Unknown type ${type}`);
    }
  }
  enqueueAction(type, ...args) {
    const a = this._createAction(type, ...args);
    this.pushAction(a);
    return a;
  }

  pushAction(a) {
    assert(a instanceof Action, 'action should be of type Action');
    this._actionQueue.push(a);
  }

  cancelAction(a) {
    this._dir.removeProducer(a.producing);
    const idx = this._actionQueue.indexOf(a);
    if (idx < 0) return console.error(`Producer.cancelAction: action not found`, p);
    this._actionQueue.splice(idx, 1);
  }

  evaluate(dt) {
    if (this._paused) return;
    // delete this.produceAction;
    this.produceAction = undefined;

    return evaluateActions(dt, this._actionQueue);
  }

  toJSON() {
    const result = Object.assign({}, this);
    delete result._dir;
    delete result.produceAction;
    return result;
  }
  revive(src) {
    this._paused = src._paused;
    this._actionQueue = src._actionQueue.map((a) => {
      const producing = this._dir.producers.find((p) => p.id == a._producing);
      switch (a.type) {
        case 'ProduceAction':
          const pa = new ProduceAction(this, a._time, producing);
          pa.revive(a);
          return pa;
      }
      throw new Error('Invalid revive');
    });
  }
}

function evaluateActions(dt, actions) {
  let head;
  let maxIter = 200;
  do {
    head = actions[0];
    if (!head) break;
    if (head.finished) {
      actions.shift();
      continue;
    }
    dt = head.evaluate(dt);
  } while ((dt > 0 || head.finished) && --maxIter);
  if (maxIter == 0) throw new Error('max iters');
  return dt;
}

export class Manager {
  _producers = [];
  _nextId = 0;

  get producers() {
    return this._producers.slice().sort((a, b) => a.id - b.id);
  }

  createUnpausedProducer() {
    return this.createProducer(false);
  }
  createProducer(paused = true) {
    const p = new Producer(this, ++this._nextId);

    this._producers.push(p);

    p._paused = paused;
    return p;
  }

  removeProducer(p) {
    p.actionQueue.forEach((a) => p.cancelAction(a));
    const idx = this._producers.indexOf(p);
    if (idx < 0) return console.error(`Manager.removeProducer: producer not found`, p);
    this._producers.splice(idx, 1);
  }

  evaluate(dt) {
    this._producers.sort((a, b) => {
      if (!!b._paused != !!a._paused) return !!b.paused - !!a._paused;
      if (!!a._actionQueue[0] != !!b._actionQueue[0]) return !!a._actionQueue[0] - !!b._actionQueue[0];
      if (!a._actionQueue[0] && !b._actionQueue[0]) return 0;
      return a._actionQueue[0]._time - b._actionQueue[0]._time;
    });
    this._producers.forEach((p) => p.evaluate(dt));
  }

  toJSON() {
    return this;
  }
  static revive(src) {
    const result = new Manager();
    result._nextId = src._nextId;
    result._producers = src._producers.map((p) => new Producer(result, p._id));
    result._producers.forEach((p, i) => p.revive(src._producers[i]));
    return result;
  }
}

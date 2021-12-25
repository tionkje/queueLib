const assert = (pred, msg = 'Assertion Failed') => {
  if (!pred) {
    console.error(msg);
    debugger;
    throw new Error(msg);
  }
};

class Action {
  __finished = false;
  _started = false;
  _producer;
  _listeners = {};

  get _finished() {
    return this.__finished;
  }
  set _finished(f) {
    if (!this.__finished && f) this.emit('finish');
    this.__finished = f;
  }

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
  get actionType() {
    throw new Error('Not implemented');
  }
  get progress() {
    throw new Error('Not implemented');
  }

  evaluate() {
    throw new Error('Not implemented');
  }

  on(event, listener) {
    const listeners = (this._listeners[event] = this._listeners[event] || []);
    listeners.push(listener);

    return () => {
      const idx = listeners.indexOf(listener);
      if (idx < 0) throw new Error('Removing non existent listener');
      listeners.splice(idx, 1);
    };
  }
  emit(event, data = {}) {
    // delay with microtask to not change array sizes while iterating
    Promise.resolve().then(() => {
      (this._listeners[event] || []).forEach((f) => f(data));
    });
  }

  toJSON() {
    const result = Object.assign({}, this);
    result.actionType = this.actionType;
    delete result._producer;
    return result;
  }
  revive(src) {
    this._started = src._started;
    this.__finished = src.__finished;
  }
}

class LockAction extends Action {
  _predicate;
  get locked() {
    return this._predicate();
  }
  get progress() {
    return this._predicate() ? 1 : 0;
  }
  get actionType() {
    return 'LockAction';
  }
  constructor(producer, pred) {
    super(producer);
    this._predicate = pred;
  }
  evaluate(dt) {
    if (this._finished) return dt;
    if (!this._started) this.emit('start');
    this._started = true;
    if (!this._predicate()) return 0;
    this._finished = true;
    return dt;
  }
  toJSON() {
    const result = super.toJSON();
    return result;
  }
  revive() {
    super.revive(src);
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
  get progress() {
    return this._time / this._totalTime;
  }
  get actionType() {
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
    if (!this._started) this.emit('start');
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
  get actionType() {
    return 'ProduceAction';
  }

  constructor(producer, time, producing) {
    super(producer, time, (dt) => {
      this._producing._paused = false;
      return this._producing.evaluate(dt);
    });
    this._producing = producing;
    this._producing.produceAction = this;
    this.on('cancel', () => {
      if (this._finished) return;
      producing._dir.removeProducer(producing);
    });
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
  get progress() {
    return this._actions[0]?.progress || 0;
  }
  get actionType() {
    return 'CompoundAction';
  }
  constructor(producer, actions) {
    super(producer);
    this._actions = actions;
    this.on('cancel', () => {
      if (this._finished) return;
      this._actions.forEach((a) => a.emit('cancel'));
    });
  }
  evaluate(dt) {
    if (this._finished) return dt;
    this._started = true;

    dt = evaluateActions(dt, this._actions);
    if (this._actions.length == 0) {
      this._finished = true;
    }
    return dt;
  }

  toJSON() {
    const result = super.toJSON();
    return result;
  }
  revive() {
    super.revive(src);
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
  enqueuePredProduceAction(pred, time) {
    return this.enqueueAction('PredProduceAction', pred, time);
  }
  enqueuePredWaitAction(pred, time, done) {
    return this.enqueueAction('PredWaitAction', pred, time, done);
  }

  _createAction(actionType, ...args) {
    switch (actionType) {
      case 'ProduceAction':
        return new ProduceAction(this, ...args, this._dir.createProducer());
      case 'WaitAction':
        return new WaitAction(this, ...args);
      case 'LockAction':
        return new LockAction(this, ...args);
      case 'CompoundAction':
        return new CompoundAction(this, ...args);
      case 'PredProduceAction': {
        const [pred, time] = args;
        const a = new CompoundAction(this, [
          new LockAction(this, pred),
          new ProduceAction(this, time, this._dir.createProducer())
        ]);
        a.producing = a.actions[1].producing;
        return a;
      }
      case 'PredWaitAction': {
        const [pred, time, done] = args;
        const a = new CompoundAction(this, [new LockAction(this, pred), new WaitAction(this, time, done)]);
        return a;
      }
    }
    throw new Error(`Unknown actionType ${actionType}`);
  }
  enqueueAction(actionType, ...args) {
    const a = this._createAction(actionType, ...args);
    this.pushAction(a);
    return a;
  }

  pushAction(a) {
    assert(a instanceof Action, 'action should be of type Action');
    this._actionQueue.push(a);
  }

  cancelActions() {
    this.actionQueue.forEach((a) => this.cancelAction(a));
  }
  cancelAction(a) {
    const idx = this._actionQueue.indexOf(a);
    if (idx < 0) return console.error(`Producer.cancelAction: action not found`, p);
    this._actionQueue.splice(idx, 1);
    a.emit('cancel');
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
      switch (a.actionType) {
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
  get pausedProducers() {
    return this._producers.filter((p) => p._paused).sort((a, b) => a.id - b.id);
  }
  get unPausedProducers() {
    return this._producers.filter((p) => !p._paused).sort((a, b) => a.id - b.id);
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
    p.cancelActions();
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

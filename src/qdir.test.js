import { Manager } from './qdir.js';
// import jest from 'jest';

// chain of queues where each producer creates the next one
function createQueueChain(dir, len = 3) {
  let prev;
  return [...Array(len)].map((x, i) => {
    if (i == 0) return (prev = dir.createUnpausedProducer());
    return (prev = prev.enqueueProduceAction(1).producing);
  });
}

describe('queueus', () => {
  let dir;
  beforeEach(() => (dir = new Manager()));

  describe('queue chain', () => {
    it('queue a producer', () => {
      expect(dir.producers.length).toBe(0);
      const p1 = dir.createUnpausedProducer();
      expect(dir.producers.length).toBe(1);
      const p2 = p1.enqueueProduceAction(1).producing;
      expect(dir.producers.length).toBe(2);
      expect(p2.paused).toBe(true);
      dir.evaluate(1);
      expect(p2.paused).toBe(false);
    });

    it('stay paused when not produced yet', () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(1);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p3.paused).toBe(true);
    });

    it('start the next in the queue', () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(2);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p3.paused).toBe(false);
    });

    it('continues next for the time that is left', () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(1.5);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p2.head.timeLeft).toBe(0.5);
      expect(p3.paused).toBe(true);
    });
  });

  it('can serialise', () => {
    createQueueChain(dir, 3);
    dir.evaluate(1.5);
    const copy = Manager.revive(JSON.parse(JSON.stringify(dir)));
    expect(JSON.stringify(copy, 0, 2)).toStrictEqual(JSON.stringify(dir, 0, 2));
  });

  it('has lockaction', () => {
    const p = dir.createUnpausedProducer();
    let locked = true;
    let done = false;
    p.enqueueLockAction(() => locked);
    p.enqueueWaitAction(1, () => (done = true));
    dir.evaluate(1);
    expect(done).toBe(false);
    locked = false;
    dir.evaluate(1);
    expect(done).toBe(true);
  });

  it('has compound actions', () => {
    const p = dir.createUnpausedProducer();
    let locked = true,
      done = false;
    p.enqueueAction('CompoundAction', [
      p._createAction('LockAction', () => locked),
      p._createAction('WaitAction', 1, () => (done = true))
    ]);
    dir.evaluate(10);
    expect(done).toBe(false);
    locked = false;
    dir.evaluate(2);
    expect(done).toBe(true);
  });

  it('preproduce action', () => {
    const p = dir.createUnpausedProducer();
    let locked = true;
    p.enqueueAction('PredProduceAction', () => locked, 1);
    dir.evaluate(2);
    expect(dir.producers.filter((p) => !p._paused).length).toBe(1);
    locked = false;
    dir.evaluate(2);
    expect(dir.producers.filter((p) => !p._paused).length).toBe(2);
  });
});

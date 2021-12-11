import { Manager, ProduceAction } from "./qdir.js";

// chain of queues where each producer creates the next one
function createQueueChain(dir, len = 3) {
  let prev;
  return [...Array(len)].map((x, i) => {
    if (i == 0) return (prev = dir.createUnpausedProducer());
    return (prev = prev.enqueueProduceAction(1));
  });
}

describe("queueus", () => {
  let dir;
  beforeEach(() => (dir = new Manager()));

  describe("queue chain", () => {
    it("queue a producer", () => {
      expect(dir.producers.length).toBe(0);
      const p1 = dir.createUnpausedProducer();
      expect(dir.producers.length).toBe(1);
      const p2 = p1.enqueueProduceAction(1);
      expect(dir.producers.length).toBe(2);
      expect(p2.paused).toBe(true);
      dir.evaluate(1);
      expect(p2.paused).toBe(false);
    });

    it("stay paused when not produced yet", () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(1);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p3.paused).toBe(true);
    });

    it("start the next in the queue", () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(2);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p3.paused).toBe(false);
    });

    it("continues next for the time that is left", () => {
      const [p1, p2, p3] = createQueueChain(dir, 3);
      dir.evaluate(1.5);
      expect(p1.paused).toBe(false);
      expect(p2.paused).toBe(false);
      expect(p2.head.timeLeft).toBe(0.5);
      expect(p3.paused).toBe(true);
    });
  });
});

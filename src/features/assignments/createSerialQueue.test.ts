import { createSerialQueue } from './createSerialQueue';

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSerialQueue', () => {
  it('runs tasks in enqueue order, one at a time', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const gates = [deferred(), deferred(), deferred()];

    const results = gates.map((gate, index) =>
      queue.enqueue(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        log.push(`start ${index}`);
        await gate.promise;
        log.push(`end ${index}`);
        running -= 1;
        return index;
      }),
    );

    // Release out of order — the queue must still finish in enqueue order.
    gates[2]?.resolve();
    gates[1]?.resolve();
    gates[0]?.resolve();

    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2]);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start 0', 'end 0', 'start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('rejects only the failing task and still runs later tasks', async () => {
    const queue = createSerialQueue();
    const failed = queue.enqueue(async () => {
      throw new Error('write failed');
    });
    const next = queue.enqueue(async () => 'ok');

    await expect(failed).rejects.toThrow('write failed');
    await expect(next).resolves.toBe('ok');
  });

  it('keeps running after a task throws synchronously', async () => {
    const queue = createSerialQueue();
    const failed = queue.enqueue((() => {
      throw new Error('sync throw');
    }) as () => Promise<void>);
    const next = queue.enqueue(async () => 'still runs');

    await expect(failed).rejects.toThrow('sync throw');
    await expect(next).resolves.toBe('still runs');
  });

  it('whenIdle resolves only after every earlier task has settled', async () => {
    const queue = createSerialQueue();
    const gate = deferred();
    let done = false;
    void queue.enqueue(async () => {
      await gate.promise;
      done = true;
    });

    let idle = false;
    const idlePromise = queue.whenIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);

    gate.resolve();
    await idlePromise;
    expect(done).toBe(true);
    expect(idle).toBe(true);
  });

  it('ends with the latest desired value when tasks read shared state at run time', async () => {
    const queue = createSerialQueue();
    const writes: string[][] = [];
    let desired: string[] = [];

    // Simulates three rapid taps: each updates the desired state immediately
    // and queues a write that reads the latest desired state when it runs.
    for (const next of [['p1'], ['p1', 'p2'], ['p2']]) {
      desired = next;
      void queue.enqueue(async () => {
        writes.push(desired);
      });
    }

    await queue.whenIdle();
    expect(writes[writes.length - 1]).toEqual(['p2']);
  });
});

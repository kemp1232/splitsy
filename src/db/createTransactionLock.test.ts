import { createTransactionLock } from './createTransactionLock';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createTransactionLock', () => {
  it('runs overlapping transactions one at a time, in call order', async () => {
    const lock = createTransactionLock();
    const events: string[] = [];
    let open = 0;
    let maxOpen = 0;
    const firstGate = deferred();

    function transaction(name: string, gate?: Promise<void>) {
      return lock.run(async () => {
        open += 1;
        maxOpen = Math.max(maxOpen, open);
        events.push(`begin ${name}`);
        await gate;
        events.push(`commit ${name}`);
        open -= 1;
        return name;
      });
    }

    const first = transaction('a', firstGate.promise);
    const second = transaction('b');
    await Promise.resolve();
    expect(events).toEqual(['begin a']);

    firstGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(events).toEqual(['begin a', 'commit a', 'begin b', 'commit b']);
    expect(maxOpen).toBe(1);
  });

  it('releases the lock when a transaction fails', async () => {
    const lock = createTransactionLock();

    const failing = lock.run(async () => {
      throw new Error('constraint failed');
    });
    const next = lock.run(async () => 'ran');

    await expect(failing).rejects.toThrow('constraint failed');
    await expect(next).resolves.toBe('ran');
  });
});

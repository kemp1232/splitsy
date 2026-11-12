import { act, renderHook } from '@testing-library/react-native';

import { ensureLocalDataOwner, type LocalDataOwnerOutcome } from './ensureLocalDataOwner';
import { useLocalDataOwnerGate } from './useLocalDataOwnerGate';

jest.mock('./ensureLocalDataOwner', () => ({ ensureLocalDataOwner: jest.fn() }));

const ensureOwner = ensureLocalDataOwner as unknown as jest.Mock;

type Props = { userId: string | null; migrationsReady: boolean };

// Each ensureLocalDataOwner call gets its own promise, resolved by the test,
// so the "check still pending" state can be observed.
let pending: { userId: string; resolve: (outcome: LocalDataOwnerOutcome) => void }[];

beforeEach(() => {
  pending = [];
  ensureOwner.mockReset().mockImplementation(
    (userId: string) =>
      new Promise<LocalDataOwnerOutcome>((resolve) => {
        pending.push({ userId, resolve });
      }),
  );
});

async function resolveCheck(index: number, outcome: LocalDataOwnerOutcome) {
  await act(async () => {
    pending[index]?.resolve(outcome);
  });
}

function renderGate(initialProps: Props) {
  return renderHook((props: Props) => useLocalDataOwnerGate(props), { initialProps });
}

describe('useLocalDataOwnerGate', () => {
  it('is not verified while the owner check is still pending for a signed-in user', async () => {
    const { result } = await renderGate({ userId: 'user-a', migrationsReady: true });

    expect(ensureOwner).toHaveBeenCalledWith('user-a');
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(false);
    expect(result.current.ownerCheckFailed).toBe(false);
  });

  it.each<LocalDataOwnerOutcome>(['recorded', 'kept', 'wiped'])(
    'is verified once the check resolves %s',
    async (outcome) => {
      const { result } = await renderGate({ userId: 'user-a', migrationsReady: true });

      await resolveCheck(0, outcome);

      expect(result.current.verified).toBe(true);
      expect(result.current.ownerResolved).toBe(true);
      expect(result.current.ownerCheckFailed).toBe(false);
    },
  );

  it("drops verified on a switch to a different user id until that id's check resolves", async () => {
    const { result, rerender } = await renderGate({ userId: 'user-a', migrationsReady: true });
    await resolveCheck(0, 'kept');
    expect(result.current.verified).toBe(true);

    await rerender({ userId: null, migrationsReady: true });
    await rerender({ userId: 'user-b', migrationsReady: true });

    expect(ensureOwner).toHaveBeenLastCalledWith('user-b');
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(false);

    await resolveCheck(1, 'wiped');
    expect(result.current.verified).toBe(true);
  });

  it('does not re-run the check for the same user id', async () => {
    const { result, rerender } = await renderGate({ userId: 'user-a', migrationsReady: true });
    await resolveCheck(0, 'recorded');

    await rerender({ userId: 'user-a', migrationsReady: true });

    expect(ensureOwner).toHaveBeenCalledTimes(1);
    expect(result.current.verified).toBe(true);
  });

  it('runs no check before migrations are ready', async () => {
    const { result, rerender } = await renderGate({ userId: 'user-a', migrationsReady: false });

    expect(ensureOwner).not.toHaveBeenCalled();
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(false);

    await rerender({ userId: 'user-a', migrationsReady: true });
    expect(ensureOwner).toHaveBeenCalledWith('user-a');
  });

  it('is resolved but not verified when signed out', async () => {
    const { result } = await renderGate({ userId: null, migrationsReady: true });

    expect(ensureOwner).not.toHaveBeenCalled();
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(true);
    expect(result.current.ownerCheckFailed).toBe(false);
  });

  it('reports a failed check as not verified and ownerCheckFailed', async () => {
    const { result } = await renderGate({ userId: 'user-a', migrationsReady: true });

    await resolveCheck(0, 'failed');

    expect(result.current.verified).toBe(false);
    expect(result.current.ownerCheckFailed).toBe(true);
    expect(result.current.ownerResolved).toBe(true);
  });

  it('re-runs the check on retry and verifies when it succeeds', async () => {
    const { result } = await renderGate({ userId: 'user-a', migrationsReady: true });
    await resolveCheck(0, 'failed');

    await act(async () => {
      result.current.retry();
    });

    expect(ensureOwner).toHaveBeenCalledTimes(2);
    expect(result.current.ownerCheckFailed).toBe(false);
    expect(result.current.verified).toBe(false);

    await resolveCheck(1, 'wiped');
    expect(result.current.verified).toBe(true);
    expect(result.current.ownerCheckFailed).toBe(false);
  });

  it('does not report a failure for user A as a failure for user B', async () => {
    const { result, rerender } = await renderGate({ userId: 'user-a', migrationsReady: true });
    await resolveCheck(0, 'failed');
    expect(result.current.ownerCheckFailed).toBe(true);

    await rerender({ userId: null, migrationsReady: true });
    await rerender({ userId: 'user-b', migrationsReady: true });

    expect(ensureOwner).toHaveBeenLastCalledWith('user-b');
    expect(result.current.ownerCheckFailed).toBe(false);
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(false);
  });

  it('does not report a stale failure while a later check for the same user is running', async () => {
    const { result, rerender } = await renderGate({ userId: 'user-b', migrationsReady: true });
    await resolveCheck(0, 'failed');
    expect(result.current.ownerCheckFailed).toBe(true);

    await rerender({ userId: 'user-a', migrationsReady: true });
    await resolveCheck(1, 'kept');
    expect(result.current.verified).toBe(true);

    await rerender({ userId: 'user-b', migrationsReady: true });

    expect(ensureOwner).toHaveBeenCalledTimes(3);
    expect(ensureOwner).toHaveBeenLastCalledWith('user-b');
    expect(result.current.ownerCheckFailed).toBe(false);
    expect(result.current.verified).toBe(false);
    expect(result.current.ownerResolved).toBe(false);
  });
});

import { savedPeopleRepository } from '@/db/repositories/savedPeople.repository';

import { rememberParticipantNames } from './savedPeople.service';

jest.mock('@/db/repositories/savedPeople.repository', () => ({
  savedPeopleRepository: { touch: jest.fn() },
}));

const touch = savedPeopleRepository.touch as jest.Mock;

describe('rememberParticipantNames', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    touch.mockResolvedValue(undefined);
  });

  it('remembers each trimmed name added to a standalone bill', async () => {
    await rememberParticipantNames([' Ana ', 'Ben'], null);

    expect(touch).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenNthCalledWith(1, 'Ana', expect.any(String));
    expect(touch).toHaveBeenNthCalledWith(2, 'Ben', expect.any(String));
  });

  it('does not remember names added to a trip bill', async () => {
    await rememberParticipantNames(['Ana'], 'trip-1');

    expect(touch).not.toHaveBeenCalled();
  });

  it('remembers different casings of one name only once', async () => {
    await rememberParticipantNames(['Ana', 'ana', 'ANA '], null);

    expect(touch).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledWith('Ana', expect.any(String));
  });

  it('ignores blank names', async () => {
    await rememberParticipantNames(['  ', ''], null);

    expect(touch).not.toHaveBeenCalled();
  });

  it('never rejects when storage fails, so adding the participant is not blocked', async () => {
    touch.mockRejectedValue(new Error('db locked'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(rememberParticipantNames(['Ana'], null)).resolves.toBeUndefined();

    consoleError.mockRestore();
  });
});

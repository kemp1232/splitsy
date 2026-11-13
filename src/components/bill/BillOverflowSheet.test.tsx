import { fireEvent, render, screen } from '@testing-library/react-native';

import { copy } from '@/constants/copy';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { BillOverflowSheet } from './BillOverflowSheet';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

async function renderSheet(onMoveToTrip?: () => void) {
  await render(
    <ThemeProvider>
      <BillOverflowSheet
        visible
        onEdit={jest.fn()}
        onShare={jest.fn()}
        onDelete={jest.fn()}
        onMoveToTrip={onMoveToTrip}
        onCancel={jest.fn()}
      />
    </ThemeProvider>,
  );
}

describe('BillOverflowSheet', () => {
  it('shows Move to trip when onMoveToTrip is given and calls it', async () => {
    const onMoveToTrip = jest.fn();
    await renderSheet(onMoveToTrip);

    fireEvent.press(await screen.findByText(copy.home.overflowMoveToTrip));
    expect(onMoveToTrip).toHaveBeenCalledTimes(1);
  });

  it('hides Move to trip when onMoveToTrip is not given (trip hub)', async () => {
    await renderSheet();

    expect(await screen.findByText(copy.home.overflowEdit)).toBeTruthy();
    expect(screen.queryByText(copy.home.overflowMoveToTrip)).toBeNull();
  });
});

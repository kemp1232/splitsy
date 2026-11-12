import { fireEvent, render, screen } from '@testing-library/react-native';

import { debtKey } from '@/features/settlement/debtPaidStatus';
import type { SettlementTransaction } from '@/features/splitting/settlement.types';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { SettlementCard } from './SettlementCard';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const aOwesC: SettlementTransaction = {
  fromParticipantId: 'a',
  toParticipantId: 'c',
  amountCentavos: 50025,
};
const bOwesC: SettlementTransaction = {
  fromParticipantId: 'b',
  toParticipantId: 'c',
  amountCentavos: 12000,
};
const names = new Map([
  ['a', 'Ana'],
  ['b', 'Ben'],
  ['c', 'Cy'],
]);

async function renderCard(props: Partial<Parameters<typeof SettlementCard>[0]> = {}) {
  await render(
    <ThemeProvider>
      <SettlementCard
        transactions={[aOwesC, bOwesC]}
        unaccountedCentavos={0}
        nameByParticipantId={names}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe('SettlementCard paid toggles', () => {
  it('renders no checkbox without onTogglePaid', async () => {
    await renderCard();
    expect(await screen.findByText('Ana owes Cy')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('renders checkbox rows with checked state from paidKeys', async () => {
    await renderCard({ paidKeys: new Set([debtKey('a', 'c')]), onTogglePaid: jest.fn() });
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('pressing an unpaid row calls onTogglePaid(transaction, true)', async () => {
    const onTogglePaid = jest.fn();
    await renderCard({ paidKeys: new Set([debtKey('a', 'c')]), onTogglePaid });
    const checkboxes = await screen.findAllByRole('checkbox');
    await fireEvent.press(checkboxes[1]!);
    expect(onTogglePaid).toHaveBeenCalledWith(bOwesC, true);
    await fireEvent.press(checkboxes[0]!);
    expect(onTogglePaid).toHaveBeenCalledWith(aOwesC, false);
  });
});

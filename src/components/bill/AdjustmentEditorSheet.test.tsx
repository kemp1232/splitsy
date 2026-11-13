import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Participant } from '@/db/repositories/participants.repository';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { AdjustmentEditorSheet, type AdjustmentEditorInitial } from './AdjustmentEditorSheet';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function participant(id: string, name: string, sortOrder: number): Participant {
  return { id, name, sortOrder, billId: 'bill-1' } as Participant;
}

const twoParticipants = [participant('p1', 'Lola', 0), participant('p2', 'Kemp', 1)];

async function renderSheet({
  participants = twoParticipants,
  initial = null,
}: { participants?: Participant[]; initial?: AdjustmentEditorInitial | null } = {}) {
  const onSave = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <ThemeProvider>
        <AdjustmentEditorSheet
          visible
          initial={initial}
          initialCustomAllocations={[]}
          participants={participants}
          onSave={onSave}
          onCancel={jest.fn()}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onSave };
}

const seniorPwdCustomHelper =
  'Enter the discount printed on the receipt, then put it under the senior or PWD diner in Custom amounts.';

describe('AdjustmentEditorSheet Senior/PWD preset', () => {
  it('fills Discount, the label and Custom split without saving', async () => {
    const { onSave } = await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));

    expect(screen.getByDisplayValue('Senior/PWD discount')).toBeTruthy();
    expect(screen.getByText('✓ Discount')).toBeTruthy();
    expect(screen.getByText('✓ Custom amounts')).toBeTruthy();
    expect(
      screen.getByText(
        'Enter the discount printed on the receipt, then put it under the senior or PWD diner in Custom amounts.',
      ),
    ).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks saving the preset until an amount is typed', async () => {
    const { onSave } = await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save adjustment' }));

    expect(screen.getByText('Enter a valid non-zero amount.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a negative Custom discount assigned to the senior', async () => {
    const { onSave } = await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));
    // Amount field first, then one custom field per participant in order.
    const amountFields = screen.getAllByPlaceholderText('0.00');
    expect(amountFields).toHaveLength(3);
    await fireEvent.changeText(amountFields[0]!, '20');
    await fireEvent.changeText(amountFields[1]!, '20');
    await fireEvent.press(screen.getByRole('button', { name: 'Save adjustment' }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'DISCOUNT',
      label: 'Senior/PWD discount',
      amountCentavos: -2000,
      allocationMethod: 'CUSTOM',
      customAllocations: [
        { participantId: 'p1', amountCentavos: -2000 },
        { participantId: 'p2', amountCentavos: -0 },
      ],
    });
  });

  it('falls back to Proportional with no participants yet', async () => {
    await renderSheet({ participants: [] });

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));

    expect(screen.getByText('✓ Proportional to items')).toBeTruthy();
    expect(screen.queryByText('Custom amounts')).toBeNull();
    expect(
      screen.getByText(
        'Enter the discount printed on the receipt. With two or more people on the bill, you can assign it to the senior or PWD diner.',
      ),
    ).toBeTruthy();
  });

  it('switching type after the preset clears its label and split', async () => {
    const { onSave } = await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Tax' }));

    expect(screen.queryByDisplayValue('Senior/PWD discount')).toBeNull();
    expect(screen.getByText('✓ Tax')).toBeTruthy();
    // Back to Tax's own default split, not the preset's Custom.
    expect(screen.getByText('✓ Proportional to items')).toBeTruthy();
    expect(screen.queryByText('✓ Custom amounts')).toBeNull();
    expect(screen.queryByText(seniorPwdCustomHelper)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps a label the user edited after the preset when switching type', async () => {
    await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));
    await fireEvent.changeText(screen.getByDisplayValue('Senior/PWD discount'), 'Lola SC');
    await fireEvent.press(screen.getByRole('radio', { name: 'Tax' }));

    expect(screen.getByDisplayValue('Lola SC')).toBeTruthy();
  });

  it('hides the Custom helper after switching the split away from Custom', async () => {
    await renderSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Senior/PWD discount' }));
    expect(screen.getByText(seniorPwdCustomHelper)).toBeTruthy();
    await fireEvent.press(screen.getByText('Proportional to items'));

    expect(screen.getByText('✓ Proportional to items')).toBeTruthy();
    expect(screen.queryByText(seniorPwdCustomHelper)).toBeNull();
  });

  it('does not offer the preset when editing an existing adjustment', async () => {
    await renderSheet({
      initial: {
        type: 'TAX',
        label: 'VAT',
        amountCentavos: 1200,
        allocationMethod: 'PROPORTIONAL',
      },
    });

    expect(await screen.findByText('Edit adjustment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Senior/PWD discount' })).toBeNull();
  });
});

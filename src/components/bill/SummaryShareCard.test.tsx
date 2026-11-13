import { render, screen } from '@testing-library/react-native';

import type { ShareImageModel } from '@/features/splitting/shareImageModel';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { SummaryShareCard } from './SummaryShareCard';

jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  resolveImageUri: jest.fn((uri: string) => Promise.resolve(uri)),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const fullModel: ShareImageModel = {
  title: 'Coffee Run',
  totalText: '₱20.00',
  people: [
    { participantId: 'me', name: 'Kemp', totalText: '₱10.00', paidText: 'Paid: ₱20.00' },
    { participantId: 'b', name: 'Bea', totalText: '₱10.00', paidText: 'Paid: ₱0.00' },
  ],
  settleLines: [{ key: '0:b->me', label: 'Bea owes Kemp', amountText: '₱10.00' }],
  payment: { heading: 'Pay Kemp via:', lines: ['GCash: 0917 123 4567'] },
};

async function renderCard(model: ShareImageModel, qrImageUri: string | null = null) {
  await render(
    <ThemeProvider>
      <SummaryShareCard model={model} qrImageUri={qrImageUri} />
    </ThemeProvider>,
  );
}

describe('SummaryShareCard', () => {
  it('renders the title, people, settle-up and payment rows', async () => {
    await renderCard(fullModel);

    expect(await screen.findByText('Coffee Run')).toBeTruthy();
    expect(screen.getByText('₱20.00')).toBeTruthy();
    expect(screen.getByText('Kemp')).toBeTruthy();
    expect(screen.getByText('Bea')).toBeTruthy();
    expect(screen.getByText('Paid: ₱20.00')).toBeTruthy();
    expect(screen.getByText('Settle up')).toBeTruthy();
    expect(screen.getByText('Bea owes Kemp')).toBeTruthy();
    expect(screen.getByText('Pay Kemp via:')).toBeTruthy();
    expect(screen.getByText('GCash: 0917 123 4567')).toBeTruthy();
  });

  it('shows the Splitsy name at the top', async () => {
    await renderCard(fullModel);

    expect(await screen.findByText('Splitsy')).toBeTruthy();
  });

  it('shows the payment QR when one is given', async () => {
    await renderCard(fullModel, 'file:///qr.png');

    expect(await screen.findByText('Payment QR code')).toBeTruthy();
    expect(await screen.findByLabelText('Your saved payment QR code')).toBeTruthy();
  });

  it('shows no QR section when there is no QR', async () => {
    await renderCard(fullModel, null);

    expect(await screen.findByText('Coffee Run')).toBeTruthy();
    expect(screen.queryByText('Payment QR code')).toBeNull();
  });

  it('renders no settle-up, payment or paid rows when the model has none', async () => {
    await renderCard({
      ...fullModel,
      people: fullModel.people.map((person) => ({ ...person, paidText: null })),
      settleLines: [],
      payment: null,
    });

    expect(await screen.findByText('Coffee Run')).toBeTruthy();
    expect(screen.queryByText('Settle up')).toBeNull();
    expect(screen.queryByText('Pay Kemp via:')).toBeNull();
    expect(screen.queryByText(/^Paid:/)).toBeNull();
  });
});

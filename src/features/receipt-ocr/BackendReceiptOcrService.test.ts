import { BackendReceiptOcrService, textToOcrDocument } from './BackendReceiptOcrService';

describe('textToOcrDocument', () => {
  it('splits transcribed text into one line per non-empty row, preserving order', () => {
    const document = textToOcrDocument('SAMPLE DINER\nBURGER MEAL 240.00\n\nTOTAL 240.00');
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.lines.map((line) => line.text)).toEqual([
      'SAMPLE DINER',
      'BURGER MEAL 240.00',
      'TOTAL 240.00',
    ]);
  });

  it('never attaches a frame — geometry is the parser row-reconstruction step, not this mapping', () => {
    const document = textToOcrDocument('BURGER 240.00');
    expect(document.blocks[0]?.lines[0]?.frame).toBeUndefined();
  });

  it('preserves the original full text on the document itself', () => {
    const raw = 'A\nB\nC';
    expect(textToOcrDocument(raw).text).toBe(raw);
  });

  it('tags the document as coming from the backend', () => {
    expect(textToOcrDocument('BURGER 240.00').source).toBe('backend');
  });
});

describe('BackendReceiptOcrService', () => {
  it('refuses to call an unconfigured backend rather than silently failing later', async () => {
    // EXPO_PUBLIC_OCR_BACKEND_URL is unset in this test environment, matching
    // src/constants/config.ts's documented "not configured" state.
    const service = new BackendReceiptOcrService();
    await expect(service.recognize('file:///receipt.jpg')).rejects.toThrow(/not configured/);
  });
});

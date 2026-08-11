import type { OcrDocument } from '@/features/receipt-ocr/ocr.types';

import { mergeFramelessLabelContinuations, mergeIntoRows, normalizeOcr } from './normalizeOcr';
import type { NormalizedLine } from './receiptParser.types';

function doc(blocks: OcrDocument['blocks']): OcrDocument {
  return { text: '', blocks };
}

function line(text: string, frame?: NormalizedLine['frame']): NormalizedLine {
  return { text, frame };
}

describe('normalizeOcr', () => {
  it('flattens lines across multiple blocks', () => {
    const result = normalizeOcr(
      doc([
        { text: '', lines: [{ text: 'A' }, { text: 'B' }] },
        { text: '', lines: [{ text: 'C' }] },
      ]),
    );
    expect(result.map((l) => l.text)).toEqual(['A', 'B', 'C']);
  });

  it('sorts by vertical position first', () => {
    const result = normalizeOcr(
      doc([
        { text: '', lines: [{ text: 'BOTTOM', frame: { x: 0, y: 100, width: 10, height: 10 } }] },
        { text: '', lines: [{ text: 'TOP', frame: { x: 0, y: 0, width: 10, height: 10 } }] },
      ]),
    );
    expect(result.map((l) => l.text)).toEqual(['TOP', 'BOTTOM']);
  });

  it('breaks ties on the same row by horizontal position', () => {
    const result = normalizeOcr(
      doc([
        {
          text: '',
          lines: [
            { text: 'RIGHT', frame: { x: 100, y: 0, width: 10, height: 10 } },
            { text: 'LEFT', frame: { x: 0, y: 2, width: 10, height: 10 } },
          ],
        },
      ]),
    );
    expect(result.map((l) => l.text)).toEqual(['LEFT', 'RIGHT']);
  });

  it('preserves original order when no geometry is present (fixture-friendly)', () => {
    const result = normalizeOcr(
      doc([{ text: '', lines: [{ text: 'FIRST' }, { text: 'SECOND' }] }]),
    );
    expect(result.map((l) => l.text)).toEqual(['FIRST', 'SECOND']);
  });
});

describe('mergeIntoRows', () => {
  it('merges a name-column line and a price-column line at the same height into one row', () => {
    const result = mergeIntoRows([
      line('CHICKEN CHAMI', { x: 0, y: 100, width: 120, height: 20 }),
      line('145.00', { x: 600, y: 102, width: 60, height: 18 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('CHICKEN CHAMI 145.00');
  });

  it('keeps genuinely separate rows apart', () => {
    const result = mergeIntoRows([
      line('CHICKEN CHAMI', { x: 0, y: 100, width: 120, height: 20 }),
      line('BEEF LOMI', { x: 0, y: 130, width: 120, height: 20 }),
    ]);
    expect(result.map((r) => r.text)).toEqual(['CHICKEN CHAMI', 'BEEF LOMI']);
  });

  it('merges 3+ columns on the same row in left-to-right order', () => {
    const result = mergeIntoRows([
      line('1', { x: 0, y: 100, width: 20, height: 20 }),
      line('BURGER', { x: 40, y: 100, width: 100, height: 20 }),
      line('240.00', { x: 600, y: 100, width: 60, height: 20 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('1 BURGER 240.00');
  });

  it('never merges lines with no geometry (existing single-column fixtures are unaffected)', () => {
    const result = mergeIntoRows([line('FIRST'), line('SECOND')]);
    expect(result.map((r) => r.text)).toEqual(['FIRST', 'SECOND']);
  });

  it('requires majority vertical overlap, not just touching edges, to avoid merging tightly-stacked rows', () => {
    // These two only overlap by 2px out of a 20px height — well under the 50% threshold.
    const result = mergeIntoRows([
      line('ROW ONE', { x: 0, y: 100, width: 100, height: 20 }),
      line('ROW TWO', { x: 0, y: 118, width: 100, height: 20 }),
    ]);
    expect(result.map((r) => r.text)).toEqual(['ROW ONE', 'ROW TWO']);
  });
});

describe('mergeFramelessLabelContinuations', () => {
  it("reunites a real receipt's 4-line item shape (name, bare quantity marker, marked unit price, line total) into one row", () => {
    const result = mergeFramelessLabelContinuations([
      line('AJI TAMAGO'),
      line('2@'),
      line('85.00v'),
      line('170.00'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('AJI TAMAGO 2@ 85.00v 170.00');
    expect(result[0]?.frame).toBeUndefined();
  });

  it('reunites a label line with its amount printed on the very next line', () => {
    const result = mergeFramelessLabelContinuations([line('Total Due'), line('1,655.71')]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('Total Due 1,655.71');
  });

  it('stops the run as soon as the next line is a fresh label, never swallowing the next unrelated item', () => {
    const result = mergeFramelessLabelContinuations([
      line('AJI TAMAGO'),
      line('2@'),
      line('85.00v'),
      line('170.00'),
      line('GYOZA'),
      line('1@'),
      line('270.00v'),
      line('270.00'),
    ]);
    expect(result.map((r) => r.text)).toEqual([
      'AJI TAMAGO 2@ 85.00v 170.00',
      'GYOZA 1@ 270.00v 270.00',
    ]);
  });

  it('never merges lines that already carry geometry (additive-only for the frameless VLM path)', () => {
    const geometryLines: NormalizedLine[] = [
      line('AJI TAMAGO', { x: 0, y: 0, width: 100, height: 20 }),
      line('2@', { x: 0, y: 20, width: 40, height: 20 }),
      line('85.00v', { x: 0, y: 40, width: 60, height: 20 }),
      line('170.00', { x: 0, y: 60, width: 60, height: 20 }),
    ];
    const result = mergeFramelessLabelContinuations(geometryLines);
    expect(result).toEqual(geometryLines);
  });

  it('leaves an ordinary complete name+amount line alone (not a label line at all)', () => {
    const result = mergeFramelessLabelContinuations([line('BURGER 240.00'), line('FRIES 80.00')]);
    expect(result.map((r) => r.text)).toEqual(['BURGER 240.00', 'FRIES 80.00']);
  });

  it('leaves a label line alone when nothing after it qualifies as a continuation', () => {
    const result = mergeFramelessLabelContinuations([
      line('SAMPLE DINER'),
      line('123 Fixture Street'),
    ]);
    expect(result.map((r) => r.text)).toEqual(['SAMPLE DINER', '123 Fixture Street']);
  });
});

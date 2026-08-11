// The one job this prompt has: get the model to solve reading order itself
// (it handles multi-column receipt layouts far better than geometric
// reconstruction did for on-device OCR — see PLAN.md's mergeIntoRows entry),
// and output plain text the existing deterministic parser can consume exactly
// like it consumes on-device OCR output today.
export const RECEIPT_TRANSCRIPTION_PROMPT = `Transcribe all text visible in this receipt image exactly as it appears, whether printed or handwritten.
Preserve the top-to-bottom, left-to-right reading order of each line, the way a person would read the receipt row by row — even where the layout uses columns (e.g. quantity, item name, and price side by side), keep all of one row's text together on one output line.
If any handwritten text is unclear, give your best-guess reading rather than skipping it or leaving it blank — an imperfect guess is more useful here than a gap.
Output ONLY the raw transcribed text, one receipt line per output line. No commentary, no markdown formatting, no explanations, no code fences.`;

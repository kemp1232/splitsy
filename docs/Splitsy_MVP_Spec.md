# Splitsy MVP Product and Technical Specification

> **Purpose:** This document is the single source of truth for Claude Code to inspect, plan, and implement the first MVP of a mobile bill-splitting application.
>
> **Working product name:** Splitsy. The name is a placeholder and must be easy to replace from one configuration file.
>
> **Primary market assumptions:** Android-first, Philippine peso (`PHP` / `₱`), English interface, restaurant and group-meal receipts.
>
> **MVP principle:** Local-first, private, usable offline, and free of per-receipt AI or OCR charges.

---

> ## ⚠ Amendment — 2026-07-31
>
> **The receipt OCR pipeline now includes an optional backend.** After real-device testing showed on-device OCR (ML Kit) struggling with real Philippine receipts — misreading printed thermal receipts and unable to read handwriting at all — the product owner decided to add a small Hono backend that sends the receipt photo to a vision-language model (Qwen3-VL 4B, self-hosted via Ollama; PaddleOCR-VL 1.6 as a config-switchable alternative) for transcription, then runs the exact same rule-based parser this spec already describes (§11) on the result. This is a deliberate, explicit change to several statements below — most directly:
>
> - §2.2's exclusion of "Cloud OCR" and "any paid AI service," and §5.5's "No LLM": the VLM itself is neither cloud nor paid (self-hosted, open-weight), but it is an LLM, and it does require a network call.
> - The "no backend" framing throughout §2.2/§5/§23: a small backend now exists (`server/`), used for exactly one purpose — receipt transcription.
> - "Usable offline": **on-device ML Kit remains as an automatic fallback** whenever the backend is unreachable (no network, server down, timeout), so scanning still works with no connectivity — it just uses the less-accurate on-device path in that case.
>
> **What did not change:** no accounts, no user data on the server, no persistent server-side storage of any kind. The backend receives the receipt image for the single request, returns transcribed text, and holds nothing afterward — the confirmed bill lives exclusively in the device's local SQLite, same as every other part of this spec describes. This amendment does not touch or relax any other part of the spec (money handling, local persistence, participant/split logic, etc.) — everything below this point is otherwise still the source of truth.
>
> Full rationale, the research behind the model/hosting choices, and implementation details are logged in `PLAN.md`'s "VLM-backed receipt OCR" entry. The original spec text below is left untouched as the historical MVP-v1 baseline it was written as.

---

> ## ⚠ Amendment — 2026-08-11
>
> **The OCR backend now calls Groq's cloud API instead of a self-hosted model.** `server/` sends the receipt photo to Groq's hosted `qwen/qwen3.6-27b` vision-language model (via Groq's OpenAI-compatible chat completions API) rather than a locally-hosted Ollama model. This is a further, explicit deviation from the previous amendment's own stated boundary:
>
> - The 2026-07-31 amendment justified crossing §5.5's "No LLM" specifically because the model was "neither cloud nor paid (self-hosted, open-weight)." That is no longer true: Groq is a third-party cloud inference provider, and while it currently has a free tier, it is a commercial AI service, not a self-hosted one. This also revisits the MVP principle's "free of per-receipt AI or OCR charges" (line 9 above) and §2.2's "any paid AI service" exclusion — this backend is still optional and free to use today, but it depends on a paid vendor's free tier rather than infrastructure the user fully controls.
> - The receipt image now leaves the developer's own network and is sent to Groq's servers for each transcription request, in addition to the existing client → local backend hop.
>
> **What did not change:** everything the 2026-07-31 amendment already covered — no accounts, no user data on the server, no persistent server-side storage, on-device ML Kit remains the automatic offline fallback, and this remains entirely optional (`EXPO_PUBLIC_OCR_BACKEND_URL` unset skips it). The backend still holds the receipt image only for the duration of one request.
>
> Full rationale and implementation details are logged in `PLAN.md`'s "Switch OCR backend to Groq" entry.

---

> ## ⚠ Amendment — 2026-08-11 (second, same day)
>
> **Groq now classifies items, totals, and adjustments itself — it no longer only transcribes text.** The amendment directly above this one (and the original 2026-07-31 amendment) both drew a specific line when first allowing an LLM into this pipeline: *"the model only ever transcribes text; it never decides what's an item, a total, or a discount"* — that line is now crossed, explicitly and at the user's direction. `server/` prompts Groq to return structured JSON (items with quantities/prices, adjustments with type/amount, subtotal, total) directly; the deterministic rule-based classifier this spec describes in §11 (`src/features/receipt-parser/`) is bypassed entirely for this path.
>
> - §11's item/total/adjustment classification rules are no longer authoritative for backend-scanned receipts — only for the on-device ML Kit fallback path, which still runs them unchanged (ML Kit has no reasoning ability of its own, so there's no way to skip them there).
> - This is a strictly larger trust surface than transcription-only: a misread word is easy to catch by eye against the receipt; a misclassified total or a dropped/invented item is a real money-correctness risk, and it's no longer checked against the 300+ tests that back the deterministic parser. The one safety net kept: the app still cross-checks Groq's own reported items+adjustments against its own reported total and surfaces a mismatch warning if they disagree (arithmetic reconciliation, not reclassification) — see `PLAN.md`'s entry for exactly what is and isn't covered.
>
> **What did not change:** everything the two amendments above already covered (no accounts, no persistent server-side storage, on-device fallback, fully optional). Receipt review before saving — spec §13.8/§13.9's core UX, letting the user see and correct every item/total before it's used — is unchanged and is what this amendment now leans on more heavily than before to catch a wrong classification, not just a wrong transcription.
>
> Full rationale and implementation details are logged in `PLAN.md`'s "Groq performs full receipt extraction" entry.

---

## 1. Product Summary

Splitsy lets a user photograph or upload a receipt, review the detected items, add the people sharing the bill, assign items to one or more people, divide taxes and other adjustments, and generate an exact per-person breakdown.

The receipt is processed on the phone with on-device OCR. The application must not treat OCR output as automatically correct. The user must review and confirm item names, prices, quantities, adjustments, and the receipt total before completing the split.

### Core value proposition

**Scan the receipt, assign the items, and know exactly what everyone owes.**

### MVP success criteria

A user can complete this flow without creating an account or connecting to a server:

1. Start a new bill.
2. Take a receipt photo, select one from the gallery, or enter items manually.
3. Extract receipt text on the device.
4. Review and correct the detected receipt data.
5. Add at least two participants.
6. Assign every item to one or more participants.
7. Allocate tax, service charge, discount, tip, or another adjustment.
8. See per-person totals that add up exactly to the computed bill total.
9. Save the bill locally.
10. Share a readable text summary through the phone's native share sheet.

---

## 2. Product Scope

### 2.1 Included in the MVP

- Android-first React Native mobile application.
- iOS-compatible project structure, subject to validating the selected OCR native module.
- No account or sign-in.
- No backend required.
- Local receipt photo capture.
- Gallery image selection.
- Manual bill entry when scanning fails or no receipt is available.
- On-device OCR using Google ML Kit Text Recognition v2 through a replaceable React Native adapter.
- Rule-based receipt parsing.
- Receipt review and correction.
- Participant management.
- Item assignment to one or multiple participants.
- Equal split of shared line items.
- Tax, VAT, service charge, tip, discount, and custom adjustments.
- Proportional, equal, or custom adjustment allocation.
- Exact integer-centavo calculations and deterministic rounding.
- Receipt-total reconciliation and discrepancy warnings.
- Local bill history and draft recovery.
- Native text sharing.
- Delete one bill or erase all local data.
- Basic accessibility and permission handling.
- Unit tests for parsing, money calculations, allocations, and rounding.

### 2.2 Explicitly excluded from the MVP

Do not implement these unless this specification is changed:

- ChatGPT, OpenAI API, or any paid AI service.
- Cloud OCR.
- User accounts, authentication, or authorization.
- Hono, Express, or another backend.
- Cloud sync, backup, or cross-device history.
- Public bill links or real-time collaborative splitting.
- Participant accounts or participant-side interaction.
- Payment collection, GCash, Maya, Stripe, bank transfer, or payment reminders.
- Contact-list access.
- SMS, email, or push notifications.
- Automatic restaurant-menu understanding.
- Guaranteed parsing of every receipt layout.
- Handwritten receipt support.
- Multi-page receipt scanning.
- Multiple currencies in one bill.
- Foreign-exchange calculations.
- Receipt expense categories or budgeting features.
- Loyalty, rewards, subscriptions, ads, or monetization.
- Web application.
- Admin dashboard.
- Advanced analytics or third-party tracking.
- PDF export or image-based summary export.
- Custom unequal weights for a shared item. Shared line items are split equally in the MVP.

---

## 3. Primary User and Use Cases

### Primary user

A person in a group who has the receipt and needs to calculate what each person owes after a meal or shared purchase.

### Primary use cases

1. **Restaurant receipt:** Four people ordered different items and shared appetizers. The receipt includes VAT and a service charge.
2. **Cafe receipt:** Two people ordered individual drinks and shared food. One discount applies to the whole bill.
3. **Manual split:** The receipt is unreadable, so the user enters line items and the total manually.
4. **Repeat review:** The user saves a completed split and opens it later to resend the breakdown.

---

## 4. Product Rules and Assumptions

- The MVP currency is PHP.
- All monetary amounts are stored as integer centavos. Never use floating-point numbers as the source of truth for money.
- One bill has at least one line item before it can be completed.
- One bill has at least two participants before it can be completed.
- Every line item must be assigned to at least one participant before completion.
- A line item assigned to multiple participants is split equally.
- A quantity is descriptive for the MVP. It helps display the receipt line but does not create quantity-based assignment controls. A user who needs different ownership can split one detected line into multiple manual lines.
- Positive adjustments add to the bill. Negative adjustments reduce the bill.
- The final participant totals must add up exactly to the app's computed bill total.
- The computed bill total may differ from the detected receipt total. The user must see and acknowledge the discrepancy before completion.
- Drafts auto-save after meaningful edits.
- Receipt scanning and splitting must work without a server connection after the OCR model is available on the device.
- OCR is an assistant, not an authority. Manual review is mandatory.

---

## 5. Recommended Technology Stack

Use the latest stable versions compatible with the selected Expo SDK at implementation time. Use `npx expo install` for Expo-managed dependencies so compatible versions are selected. Commit the lockfile.

### 5.1 Core application

| Area | Technology | Decision |
|---|---|---|
| Mobile framework | Expo + React Native | Use an Expo development build because the OCR package contains native code. Do not rely on Expo Go for the complete app. |
| Language | TypeScript with strict mode | Enable `strict`, `noUncheckedIndexedAccess`, and safe linting rules. |
| Routing | Expo Router | File-based routes under `src/app`. |
| Package manager | `pnpm` | Commit `pnpm-lock.yaml`. |
| Runtime version | Node.js LTS supported by the selected Expo SDK | Commit `.nvmrc`; do not select an unsupported Node version manually. |
| Styling | React Native `StyleSheet` plus app design tokens | Avoid a large UI framework for the MVP. Build small reusable primitives. |
| Icons | Expo-compatible icon package already available in the template | Do not add an icon package unless needed. |

### 5.2 Receipt capture and OCR

| Area | Technology | Decision |
|---|---|---|
| Camera | `expo-camera` | Capture a clear receipt photo with rear camera. |
| Gallery import | `expo-image-picker` | Let the user select a receipt image. |
| Image preparation | `expo-image-manipulator` | Normalize orientation, crop when supported by the implemented UI, and resize large images before OCR. Preserve the original image. |
| App-owned image storage | `expo-file-system` | Copy selected or captured images into an app-owned receipt directory so drafts remain valid after restarts. |
| OCR engine | Google ML Kit Text Recognition v2, Latin script | On-device receipt text extraction. No per-image API billing. |
| React Native OCR bridge | Primary candidate: `@react-native-ml-kit/text-recognition` | Put it behind a `ReceiptOcrService` interface. Perform a compatibility spike before building the complete receipt flow. |
| OCR fallback | Manual item entry | This fallback is mandatory and must not depend on the OCR package. |

### 5.3 Local data and application state

| Area | Technology | Decision |
|---|---|---|
| Database | `expo-sqlite` | Persistent local storage. |
| Typed database access | Drizzle ORM with the Expo SQLite driver | Use schema definitions and committed migrations. Keep database operations behind repositories. |
| Draft UI state | Zustand | Store only transient workflow state and the current bill ID. SQLite remains the persistent source of truth. |
| Forms | React Hook Form | Use controlled React Native inputs through `Controller`. |
| Validation | Zod | Share schemas between forms, parser output validation, and repository boundaries. |
| IDs | `expo-crypto` UUID support or an equally reliable local UUID method | IDs must be generated on the device and remain stable. |

### 5.4 Sharing, testing, and quality

| Area | Technology | Decision |
|---|---|---|
| Sharing | React Native's native `Share` API | Share a text breakdown. |
| Copy to clipboard | `expo-clipboard` | Optional but included in the MVP summary page. |
| Unit/component tests | `jest-expo` and React Native Testing Library | Prioritize pure parser and splitting logic tests. |
| Linting | Expo ESLint setup | Fail CI or the local verification command on lint errors. |
| Formatting | Prettier | Consistent formatting. |
| Type checking | `tsc --noEmit` | Required before considering a milestone complete. |

### 5.5 Technologies intentionally not used

- No backend framework in the MVP.
- No remote database.
- No authentication provider.
- No cloud object storage.
- No LLM.
- No remote feature-flag service.
- No third-party product analytics.
- No advertisement SDK.

---

## 6. Required Technical Spike Before Full Implementation

Claude Code must plan and complete a small OCR compatibility spike early. Do not build the full receipt workflow before this passes.

### Spike goal

Prove that the selected Expo SDK, development build, Android target, and OCR bridge can recognize text from a local receipt image URI.

### Spike acceptance criteria

- A minimal development build installs on an Android emulator or physical device.
- A bundled sample receipt can be selected.
- The OCR adapter returns:
  - Full recognized text.
  - Blocks.
  - Lines.
  - Bounding rectangles or equivalent coordinates.
  - Confidence values when exposed by the bridge.
- The result can be logged or displayed in a temporary diagnostic screen.
- The feature works without sending the receipt to an application server.
- The implementation documents any first-run model-download behavior.
- The OCR library is isolated behind an interface.
- If the selected bridge is incompatible, replace only the adapter implementation, not the parser or UI contracts.

### Required interface

```ts
export interface ReceiptOcrService {
  recognize(imageUri: string): Promise<OcrDocument>;
}

export type OcrDocument = {
  text: string;
  blocks: OcrBlock[];
};

export type OcrBlock = {
  text: string;
  frame?: Rect;
  confidence?: number;
  lines: OcrLine[];
};

export type OcrLine = {
  text: string;
  frame?: Rect;
  confidence?: number;
  rotationDegrees?: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
```

---

## 7. High-Level Architecture

```text
Expo Router screens
        |
        v
Feature controllers / hooks
        |
        +--------------------------+
        |                          |
        v                          v
Receipt workflow             Bill workflow
        |                          |
        v                          v
ReceiptOcrService          SplitCalculator
ReceiptParser              BillValidator
        |                          |
        +-------------+------------+
                      |
                      v
               Repository layer
                      |
                      v
              Drizzle + SQLite

Receipt images -> app-owned file directory
Share summary -> native Share API
```

### Architecture principles

- Keep OCR, parsing, persistence, and calculation logic separate.
- Keep receipt parsing and split calculations as pure functions wherever possible.
- Do not call the OCR bridge directly from a screen component.
- Do not put SQL directly in screen components.
- Do not use formatted currency strings as calculation inputs.
- Do not make navigation route parameters the source of truth for bill data.
- Keep all user-facing copy in centralized constants so it can be revised or localized later.
- Treat scanned data as untrusted input and validate it before storage.

---

## 8. Suggested Project Structure

```text
splitsy/
  src/
    app/
      _layout.tsx
      index.tsx
      onboarding.tsx
      settings.tsx
      bill/
        new.tsx
        capture.tsx
        preview.tsx
        processing.tsx
        [billId]/
          index.tsx
          receipt-review.tsx
          participants.tsx
          assignments.tsx
          adjustments.tsx
          summary.tsx
    components/
      ui/
        AppButton.tsx
        AppTextInput.tsx
        AmountInput.tsx
        Screen.tsx
        SectionCard.tsx
        EmptyState.tsx
        LoadingState.tsx
        ErrorState.tsx
        ConfirmationDialog.tsx
        BottomActionBar.tsx
      bill/
        BillListItem.tsx
        LineItemRow.tsx
        ParticipantChip.tsx
        AssignmentRow.tsx
        AdjustmentRow.tsx
        PersonTotalCard.tsx
    features/
      bills/
        bill.schemas.ts
        bill.types.ts
        bill.repository.ts
        bill.service.ts
        bill.selectors.ts
      receipt-capture/
        receiptImage.service.ts
        receiptImage.types.ts
      receipt-ocr/
        ReceiptOcrService.ts
        MlKitReceiptOcrService.ts
        ocr.types.ts
      receipt-parser/
        parseReceipt.ts
        normalizeOcr.ts
        detectAmounts.ts
        classifyReceiptLines.ts
        receiptKeywords.ts
        receiptParser.types.ts
      participants/
        participant.schemas.ts
      splitting/
        splitCalculator.ts
        allocation.ts
        reconciliation.ts
        split.types.ts
    db/
      client.ts
      schema.ts
      migrations.ts
      repositories/
    store/
      billDraft.store.ts
    lib/
      money.ts
      date.ts
      ids.ts
      invariant.ts
      logger.ts
    constants/
      copy.ts
      config.ts
      limits.ts
    theme/
      tokens.ts
      typography.ts
    test/
      fixtures/
        receipts/
        parsedReceipts/
  drizzle/
  assets/
  app.config.ts
  eas.json
  package.json
  pnpm-lock.yaml
  tsconfig.json
  eslint.config.js
  .nvmrc
  README.md
```

The exact filenames may change, but preserve the separation of concerns.

---

## 9. Data Model

### 9.1 Bill

```ts
type BillStatus = 'DRAFT' | 'COMPLETED';
type BillEntryMethod = 'CAMERA' | 'GALLERY' | 'MANUAL';

type Bill = {
  id: string;
  title: string;
  merchantName: string | null;
  receiptDate: string | null; // YYYY-MM-DD
  currency: 'PHP';
  entryMethod: BillEntryMethod;
  status: BillStatus;
  receiptImageUri: string | null;
  originalReceiptImageUri: string | null;
  rawOcrText: string | null;
  detectedReceiptTotalCentavos: number | null;
  detectedSubtotalCentavos: number | null;
  parserVersion: number | null;
  discrepancyAcknowledged: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
```

### 9.2 Line item

```ts
type LineItemSource = 'OCR' | 'MANUAL';

type LineItem = {
  id: string;
  billId: string;
  sortOrder: number;
  name: string;
  quantity: number; // integer 1-99 in MVP
  unitPriceCentavos: number | null;
  lineTotalCentavos: number;
  source: LineItemSource;
  confidence: number | null;
  rawText: string | null;
  createdAt: string;
  updatedAt: string;
};
```

`lineTotalCentavos` is authoritative. `unitPriceCentavos` is optional because many receipts only expose a line total or use formatting that makes the unit price uncertain.

### 9.3 Participant

```ts
type Participant = {
  id: string;
  billId: string;
  sortOrder: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};
```

Participant names must be non-empty, trimmed, no longer than 30 characters, and unique within a bill after case-insensitive normalization.

### 9.4 Item assignment

```ts
type ItemAssignment = {
  lineItemId: string;
  participantId: string;
  weight: 1;
};
```

The `weight` field is fixed to `1` in the MVP so shared items divide equally. Keeping the field allows weighted splits to be added later without redesigning the relationship.

### 9.5 Adjustment

```ts
type AdjustmentType =
  | 'TAX'
  | 'SERVICE_CHARGE'
  | 'TIP'
  | 'DISCOUNT'
  | 'OTHER';

type AllocationMethod = 'PROPORTIONAL' | 'EQUAL' | 'CUSTOM';

type Adjustment = {
  id: string;
  billId: string;
  sortOrder: number;
  type: AdjustmentType;
  label: string;
  amountCentavos: number; // negative for discounts
  allocationMethod: AllocationMethod;
  source: 'OCR' | 'MANUAL' | 'RECONCILIATION';
  createdAt: string;
  updatedAt: string;
};
```

### 9.6 Custom adjustment allocation

```ts
type AdjustmentAllocation = {
  adjustmentId: string;
  participantId: string;
  amountCentavos: number;
};
```

Store custom allocations only when `allocationMethod` is `CUSTOM`. Proportional and equal allocations should be calculated deterministically.

### 9.7 Suggested SQLite tables

- `bills`
- `line_items`
- `participants`
- `item_assignments`
- `adjustments`
- `adjustment_allocations`
- `app_settings`

Use foreign keys and cascade deletes. Add indexes for child records by `bill_id`, and preserve `sort_order`.

---

## 10. Money and Splitting Rules

### 10.1 Money representation

- Store `₱123.45` as `12345` centavos.
- Parse user input into centavos before saving.
- Format centavos only at the UI boundary.
- Reject `NaN`, infinity, and values outside configured safe limits.
- Suggested maximum bill amount: `₱9,999,999.99`.

### 10.2 Computed bill totals

```text
item subtotal = sum(line item totals)
adjustment total = sum(adjustment amounts)
computed total = item subtotal + adjustment total
receipt difference = detected receipt total - computed total
```

Discounts must use negative amounts.

### 10.3 Equal item allocation

For an item assigned to `n` participants:

1. Calculate `base = floor(itemTotalCentavos / n)`.
2. Calculate `remainder = itemTotalCentavos - base * n`.
3. Give `base + 1` centavo to the first `remainder` participants in stable participant sort order.
4. Give `base` to the others.

This guarantees that item shares sum exactly to the item total.

### 10.4 Equal adjustment allocation

Use the same integer division and remainder process across all participants in stable participant order.

### 10.5 Proportional adjustment allocation

Allocate based on each participant's item subtotal before adjustments.

1. Calculate each participant's exact rational share.
2. Take the floor of each share.
3. Distribute the remaining centavos using the largest-remainder method.
4. Break ties using stable participant sort order.

When all participant item subtotals are zero, fall back to equal allocation and surface this in code comments and tests.

### 10.6 Custom adjustment allocation

- The user enters one amount for each participant.
- The sum must equal the adjustment amount exactly.
- Negative custom allocations are allowed only for a negative adjustment.
- Positive custom allocations are allowed only for a positive adjustment.
- Do not allow completion while the custom allocation is out of balance.

### 10.7 Final total invariant

```text
sum(all participant final totals) === computed bill total
```

This must be asserted in the calculation service and covered by tests.

### 10.8 Receipt discrepancy handling

If the detected receipt total differs from the computed total:

- Show the exact difference.
- Offer **Add difference as an adjustment**.
  - Positive difference becomes an `OTHER` charge.
  - Negative difference becomes an `OTHER` discount.
- Offer **Review items**.
- Allow **Continue with difference** only after a confirmation dialog.
- Save `discrepancyAcknowledged = true` if the user continues.
- Display a warning on the completed summary when the totals still differ.

---

## 11. Receipt OCR and Parsing Pipeline

### 11.1 End-to-end pipeline

```text
Capture or choose receipt image
        -> copy to app-owned storage
        -> normalize orientation and size
        -> run on-device OCR
        -> normalize OCR blocks and lines
        -> detect monetary values and line geometry
        -> classify receipt lines
        -> infer merchant, items, subtotal, adjustments, and total
        -> validate parser output
        -> save a draft
        -> require user review
```

### 11.2 Image guidance

The capture UI should encourage the user to:

- Place the receipt on a flat surface.
- Use good, even lighting.
- Avoid shadows and glare.
- Keep the full receipt inside the frame.
- Hold the phone parallel to the receipt.
- Retake a blurry image.

### 11.3 Image storage rules

- Keep the original captured or selected image in an app-owned directory.
- Create a separate OCR-ready derivative when resizing or rotating.
- Store only the app-owned URI in the database.
- Delete both original and derivative files when the bill is permanently deleted.
- Clean orphaned temporary files on app startup or through a maintenance function.

### 11.4 OCR normalization

Convert native OCR output into a platform-neutral structure:

- Full text.
- Blocks.
- Lines.
- Text content.
- Bounding rectangle.
- Confidence where available.
- Rotation where available.

Sort normalized lines primarily by vertical position and secondarily by horizontal position. Preserve raw positions for column and wrapped-line heuristics.

### 11.5 Amount recognition

Support common PHP receipt formats such as:

```text
99.00
1,250.00
₱99.00
P 99.00
PHP 99.00
-50.00
(50.00)
```

The parser must reduce false positives from:

- Dates.
- Times.
- OR numbers.
- TINs.
- Phone numbers.
- Card numbers.
- Transaction IDs.
- Table numbers.

The rightmost monetary value on a likely item line is usually the line total. When a line has several monetary values, preserve them in parser diagnostics and choose the rightmost plausible amount as the first heuristic.

### 11.6 Quantity patterns

Recognize common patterns when possible:

```text
2 BURGER 240.00
2x BURGER 240.00
2 X 120.00 240.00
2 @ 120.00 240.00
BURGER 2 240.00
```

Rules:

- Quantity must be an integer between 1 and 99.
- If quantity is uncertain, use `1` and keep the detected line total.
- Never divide the line total by a guessed quantity without preserving the line total.

### 11.7 Receipt line classification

Maintain keyword groups in one configurable module.

#### Strong total keywords

- `GRAND TOTAL`
- `TOTAL DUE`
- `AMOUNT DUE`
- `NET TOTAL`
- `TOTAL`

#### Subtotal keywords

- `SUBTOTAL`
- `SUB TOTAL`
- `FOOD TOTAL`

#### Positive adjustment keywords

- `VAT`
- `TAX`
- `SERVICE CHARGE`
- `SERVICE FEE`
- `SC`
- `TIP`
- `GRATUITY`

#### Negative adjustment keywords

- `DISCOUNT`
- `PROMO`
- `COUPON`
- `LESS`
- `PWD DISCOUNT`
- `SENIOR DISCOUNT`

#### Payment or non-item keywords

- `CASH`
- `TENDERED`
- `CHANGE`
- `CARD`
- `CREDIT`
- `DEBIT`
- `GCASH`
- `MAYA`
- `AMOUNT PAID`
- `PAYMENT`
- `BALANCE`
- `CUSTOMER COPY`
- `MERCHANT COPY`
- `OR NO`
- `TIN`
- `VAT REG`
- `TABLE`
- `SERVER`
- `CASHIER`

Keyword matching must be case-insensitive and tolerant of extra punctuation and whitespace.

### 11.8 Item candidate heuristic

A line is a likely item when:

- It contains a plausible monetary value near the right side.
- It contains non-keyword text before the amount.
- It is not classified as total, subtotal, payment, change, header, footer, or adjustment.
- It appears before the final total region when geometry is available.

Support wrapped item names:

- A preceding line with text but no amount can be joined to the next item line when the vertical gap and left alignment are plausible.
- Keep the original raw lines for debugging and user inspection.

### 11.9 Merchant inference

Use the first several non-empty lines near the top of the receipt. Prefer a line that:

- Contains letters.
- Is not mostly numeric.
- Is not an address, phone number, TIN, receipt number, date, or transaction label.
- Has relatively prominent geometry when that information is available.

Merchant inference is optional. The user must be able to edit or clear it.

### 11.10 Total inference

- Prefer a strong total keyword near the bottom of the receipt.
- Exclude lines containing `CASH`, `TENDERED`, `CHANGE`, or payment-method keywords.
- When several strong totals exist, prefer the last plausible total before payment lines.
- Preserve alternatives in parser diagnostics for tests and debugging.

### 11.11 Parser output

```ts
type ParsedReceipt = {
  merchantName: string | null;
  receiptDate: string | null;
  items: ParsedLineItem[];
  adjustments: ParsedAdjustment[];
  detectedSubtotalCentavos: number | null;
  detectedTotalCentavos: number | null;
  rawText: string;
  warnings: ParserWarning[];
  diagnostics: ParserDiagnostics;
};
```

### 11.12 Parser warnings

Examples:

- No line items detected.
- No receipt total detected.
- Multiple possible totals found.
- Detected subtotal does not match item subtotal.
- Detected total does not match parsed items and adjustments.
- Low-confidence OCR lines were used.
- Possible payment line was excluded.

The UI does not need to show every technical diagnostic, but it should show a plain-language review warning.

---

## 12. Complete Functional Requirements

### F-001 First launch

- Show onboarding only on first launch.
- The user can continue without signing in.
- Save the onboarding-complete setting locally.

### F-002 Home and bill history

- List saved drafts and completed bills, newest first.
- Each row shows title or merchant, date, total when available, participant count, and status.
- A user can open, resume, edit, share, or delete a bill.
- Show an empty state when no bills exist.

### F-003 Start a bill

The user can choose:

- Take a photo.
- Choose from photos.
- Enter items manually.

Create a draft once the user selects a source or begins manual entry.

### F-004 Camera permission

- Request camera permission only when the camera option is selected.
- Explain why the permission is needed.
- Handle denial and permanent denial.
- Provide gallery and manual alternatives.

### F-005 Capture receipt

- Use the rear camera.
- Show a receipt guide frame.
- Allow flash mode `auto`, `on`, and `off` when supported.
- Capture one image.
- Navigate to preview.

### F-006 Select receipt image

- Request photo-library permission only when required by the platform.
- Accept common image formats supported by Expo Image Picker.
- Reject an inaccessible or invalid asset with a clear error.

### F-007 Preview image

- Show the captured or selected image.
- Allow retake or choose another image.
- Allow rotation in 90-degree steps.
- Provide **Use this photo**.
- Cropping can be a simple rectangular crop if practical; otherwise make crop a post-MVP item. Do not block the MVP on a sophisticated document-edge detector.

### F-008 OCR processing

- Show progress immediately.
- Copy and normalize the image before OCR.
- Call the OCR adapter.
- Parse and validate the result.
- Save raw OCR text and parsed draft data.
- Navigate to receipt review.
- On failure, allow retry, use another photo, view raw text when available, or enter manually.

### F-009 Manual entry

- Create a bill without a receipt image.
- Let the user add, edit, delete, and reorder line items.
- Let the user enter an optional merchant/title and receipt total.
- Continue through the same participants, assignment, adjustment, and summary flow.

### F-010 Receipt review

- Show merchant and optional date fields.
- Show all detected line items.
- Show quantity, line name, and line total.
- Allow add, edit, delete, and reorder.
- Show detected subtotal and total when available.
- Show the current computed subtotal and total.
- Show discrepancy status.
- Allow viewing extracted raw text in a collapsible or modal view.
- Require at least one valid item before continuing.

### F-011 Add or edit a line item

Fields:

- Item name.
- Quantity.
- Line total.
- Optional unit price display or input only when the product design can keep it unambiguous.

Validation:

- Name is required and trimmed.
- Name maximum: 80 characters.
- Quantity: integer 1-99.
- Line total: greater than or equal to zero and within maximum bill limits.

### F-012 Participants

- Add at least two people.
- Edit, remove, and reorder participants.
- Prevent duplicate normalized names.
- Provide quick suggestions such as `Me`, but do not access contacts.
- Removing a participant removes their assignments and custom adjustment allocations after confirmation.

### F-013 Assign items

- Display every line item with price and assignment status.
- Selecting an item opens participant choices.
- Allow one or multiple participants.
- Shared items divide equally.
- Provide **Assign all unassigned to me** when a participant named `Me` exists or let the user choose a participant.
- Provide filters or sections for `Unassigned` and `Assigned` if useful.
- Prevent continuing while any item is unassigned.

### F-014 Adjustments

- Detect and show parsed adjustments.
- Add, edit, delete, and reorder adjustments.
- Supported types: tax, service charge, tip, discount, other.
- Default allocation:
  - Tax: proportional.
  - Service charge: proportional.
  - Tip: equal, unless changed.
  - Discount: proportional.
  - Other: proportional.
- Let the user select proportional, equal, or custom allocation.
- Custom allocation must balance exactly.

### F-015 Reconcile total

- Display item subtotal.
- Display each adjustment.
- Display computed total.
- Display detected receipt total when available.
- Display exact difference.
- Allow the difference to be added as an `OTHER` adjustment.
- Allow review of items.
- Allow explicit continuation with an unresolved discrepancy.

### F-016 Summary

- Show the bill title, merchant, date, computed total, and receipt-match status.
- Show one card or section per participant.
- Each participant section shows:
  - Assigned item shares.
  - Adjustment shares.
  - Final amount owed.
- Expand or collapse details.
- Save as completed.
- Share text.
- Copy text.
- Edit the bill.

### F-017 Share summary

Generate a plain-text summary suitable for Messenger, Viber, SMS, email, or notes.

Example:

```text
Splitsy — Dinner at Sample Restaurant
Total: ₱1,245.50

Kemp — ₱520.25
• Chicken Meal — ₱320.00
• Shared Nachos — ₱100.00
• Service charge — ₱50.25
• VAT — ₱50.00

Alex — ₱410.25
• Pasta — ₱260.00
• Shared Nachos — ₱100.00
• Service charge — ₱30.25
• VAT — ₱20.00

Jamie — ₱315.00
• Salad — ₱215.00
• Shared Nachos — ₱100.00

Calculated with Splitsy.
```

The exact line items must use each participant's allocated item share, not always the full line price.

### F-018 Autosave and draft recovery

- Save after receipt processing and after meaningful edits.
- Debounce frequent text-field saves.
- Show a subtle saving state only when useful.
- A draft remains available after app restart or crash.
- Opening a draft returns the user to the earliest incomplete step.

### F-019 Delete bill

- Confirm permanent deletion.
- Delete related database rows.
- Delete app-owned receipt images.
- Return to home.

### F-020 Settings and privacy

- Show app version.
- Show that receipt images and bill history are stored locally for the MVP.
- Provide **Delete all local data** with destructive confirmation.
- Provide a short privacy explanation.

---

## 13. Routes, Pages, and Exact UI Copy

All copy should live in `src/constants/copy.ts` or another centralized copy module. Do not scatter important user-facing strings across screens.

### 13.1 Onboarding — `/onboarding`

**Purpose:** Explain the value and local-first behavior.

| Element | Copy |
|---|---|
| App name | `Splitsy` |
| Heading | `Split bills without doing the math.` |
| Body | `Scan a receipt, assign the items, and see exactly what everyone owes.` |
| Privacy note | `No account needed. Your receipts and bill history stay on this device.` |
| Primary button | `Get started` |
| Secondary link | `How it works` |
| How-it-works step 1 | `1. Scan or enter the receipt` |
| How-it-works step 2 | `2. Add the people sharing the bill` |
| How-it-works step 3 | `3. Assign items and share the totals` |

### 13.2 Home — `/`

| State/element | Copy |
|---|---|
| Page title | `Bills` |
| Primary action | `New bill` |
| Empty heading | `No bills yet` |
| Empty body | `Scan a receipt or enter items manually to create your first split.` |
| Empty CTA | `Split a bill` |
| Draft badge | `Draft` |
| Completed badge | `Completed` |
| Unknown merchant title | `Untitled bill` |
| Resume action | `Continue` |
| Open action | `View split` |
| Overflow edit | `Edit bill` |
| Overflow share | `Share summary` |
| Overflow delete | `Delete bill` |

### 13.3 New bill source — `/bill/new`

| Element | Copy |
|---|---|
| Heading | `Add a receipt` |
| Body | `Choose the fastest way to start your split.` |
| Camera title | `Take a photo` |
| Camera description | `Best for a receipt in front of you.` |
| Gallery title | `Choose from photos` |
| Gallery description | `Use a receipt image already on your phone.` |
| Manual title | `Enter items manually` |
| Manual description | `Start without scanning a receipt.` |
| Back confirmation heading | `Leave this bill?` |
| Back confirmation body | `Your progress has not been saved yet.` |
| Stay action | `Keep editing` |
| Leave action | `Leave` |

### 13.4 Camera permission state — `/bill/capture`

| Element | Copy |
|---|---|
| Heading | `Allow camera access` |
| Body | `Splitsy uses your camera only to photograph the receipt.` |
| Primary button | `Allow camera` |
| Gallery alternative | `Choose from photos instead` |
| Manual alternative | `Enter items manually` |
| Permanent denial body | `Camera access is turned off. Enable it in your phone settings, or choose another way to add the receipt.` |
| Settings button | `Open settings` |

### 13.5 Camera capture — `/bill/capture`

| Element | Copy |
|---|---|
| Instruction | `Fit the whole receipt inside the frame.` |
| Tip | `Keep it flat, well lit, and in focus.` |
| Capture accessibility label | `Take receipt photo` |
| Flash auto | `Flash: Auto` |
| Flash on | `Flash: On` |
| Flash off | `Flash: Off` |
| Gallery action | `Photos` |
| Close accessibility label | `Close camera` |

### 13.6 Receipt preview — `/bill/preview`

| Element | Copy |
|---|---|
| Heading | `Check the photo` |
| Body | `Make sure the item names and prices are easy to read.` |
| Primary button | `Use this photo` |
| Retake action | `Retake` |
| Choose another action | `Choose another` |
| Rotate action | `Rotate` |
| Quality warning | `This photo may be hard to read. You can still try it or take a clearer one.` |

### 13.7 Processing — `/bill/processing`

| State/element | Copy |
|---|---|
| Primary heading | `Reading your receipt…` |
| Body | `This can take a few seconds.` |
| Privacy note | `Text extraction happens on this device.` |
| Stage preparing | `Preparing image` |
| Stage reading | `Finding text` |
| Stage organizing | `Organizing items and totals` |
| Cancel action | `Cancel` |

### 13.8 OCR failure state

| Element | Copy |
|---|---|
| Heading | `We couldn't read this receipt` |
| Body | `Try a clearer photo, or enter the items manually.` |
| Retry button | `Try again` |
| Another photo button | `Use another photo` |
| Manual button | `Enter items manually` |
| Technical details action | `View extracted text` |
| No text detail | `No readable text was found.` |

### 13.9 Receipt review — `/bill/[billId]/receipt-review`

| Element | Copy |
|---|---|
| Heading | `Review receipt` |
| Body | `Check the items and prices before continuing.` |
| Detected count, singular | `We found 1 item.` |
| Detected count, plural | `We found {count} items.` |
| Merchant label | `Merchant or bill name` |
| Merchant placeholder | `Example: Dinner at Mesa` |
| Date label | `Receipt date` |
| Items section | `Items` |
| Add item | `Add item` |
| Detected subtotal label | `Receipt subtotal` |
| Item subtotal label | `Items subtotal` |
| Detected total label | `Receipt total` |
| Computed total label | `Current total` |
| Match success | `The current total matches the receipt.` |
| Mismatch warning | `The current total is {difference} {higherOrLower} than the receipt.` |
| Higher word | `higher` |
| Lower word | `lower` |
| Raw text action | `View extracted text` |
| Continue button | `Add people` |
| No items heading | `No items found` |
| No items body | `Add the receipt items manually to continue.` |

### 13.10 Add/edit item sheet or modal

| Element | Copy |
|---|---|
| Add heading | `Add item` |
| Edit heading | `Edit item` |
| Name label | `Item name` |
| Name placeholder | `Example: Chicken meal` |
| Quantity label | `Quantity` |
| Amount label | `Line total` |
| Amount placeholder | `0.00` |
| Save action | `Save item` |
| Delete action | `Delete item` |
| Cancel action | `Cancel` |
| Required-name error | `Enter an item name.` |
| Invalid-quantity error | `Quantity must be a whole number from 1 to 99.` |
| Invalid-amount error | `Enter a valid amount.` |
| Delete confirmation heading | `Delete this item?` |
| Delete confirmation body | `This item and its assignments will be removed.` |

### 13.11 Participants — `/bill/[billId]/participants`

| Element | Copy |
|---|---|
| Heading | `Who's splitting this bill?` |
| Body | `Add everyone who should receive a share.` |
| Add action | `Add person` |
| Quick-add me | `Add me` |
| Continue button | `Assign items` |
| Minimum error | `Add at least 2 people to continue.` |
| Empty heading | `No one added yet` |
| Empty body | `Start by adding yourself and the other people sharing the bill.` |
| Remove confirmation heading | `Remove {name}?` |
| Remove confirmation body | `Their item assignments and custom adjustment amounts will also be removed.` |
| Remove action | `Remove person` |

### 13.12 Add/edit participant sheet or modal

| Element | Copy |
|---|---|
| Add heading | `Add person` |
| Edit heading | `Edit person` |
| Name label | `Name` |
| Name placeholder | `Example: Alex` |
| Save action | `Save person` |
| Cancel action | `Cancel` |
| Required error | `Enter a name.` |
| Duplicate error | `That name is already in this bill.` |
| Too-long error | `Use 30 characters or fewer.` |

### 13.13 Item assignment — `/bill/[billId]/assignments`

| Element | Copy |
|---|---|
| Heading | `Who had what?` |
| Body | `Choose one or more people for every item.` |
| Shared note | `Items assigned to more than one person are split equally.` |
| Unassigned section | `Unassigned` |
| Assigned section | `Assigned` |
| Assignment action | `Choose people` |
| One-person state | `{name}` |
| Multi-person state | `Shared by {count}` |
| No-assignment state | `Not assigned` |
| Bulk action | `Assign all unassigned` |
| Continue button | `Review fees and discounts` |
| Blocking error heading | `Assign every item` |
| Blocking error body | `{count} {itemWord} still need {assignmentWord}.` |
| Singular item word | `item` |
| Plural item word | `items` |
| Singular assignment word | `an assignment` |
| Plural assignment word | `assignments` |

### 13.14 Participant picker sheet

| Element | Copy |
|---|---|
| Heading | `Who shared this item?` |
| Body | `Select everyone who should pay for it.` |
| Select all | `Select all` |
| Clear | `Clear` |
| Save | `Save assignment` |
| Required error | `Choose at least one person.` |

### 13.15 Adjustments — `/bill/[billId]/adjustments`

| Element | Copy |
|---|---|
| Heading | `Fees, tax, and discounts` |
| Body | `Check the extra amounts and choose how to split them.` |
| Add action | `Add adjustment` |
| Empty heading | `No extra amounts` |
| Empty body | `Add tax, service charge, tip, discount, or another amount when needed.` |
| Allocation proportional | `Proportional to items` |
| Allocation proportional detail | `People with larger item totals pay a larger share.` |
| Allocation equal | `Split equally` |
| Allocation equal detail | `Everyone gets the same share.` |
| Allocation custom | `Enter custom amounts` |
| Allocation custom detail | `Set the exact amount for each person.` |
| Item subtotal | `Items subtotal` |
| Adjustments total | `Adjustments` |
| Computed total | `Current total` |
| Receipt total | `Receipt total` |
| Match success | `Everything matches the receipt.` |
| Difference warning | `There's a {difference} difference.` |
| Add difference | `Add difference as an adjustment` |
| Review items | `Review items` |
| Continue button | `See everyone's share` |
| Continue-with-difference | `Continue with difference` |

### 13.16 Add/edit adjustment sheet or modal

| Element | Copy |
|---|---|
| Add heading | `Add adjustment` |
| Edit heading | `Edit adjustment` |
| Type label | `Type` |
| Type tax | `Tax` |
| Type service | `Service charge` |
| Type tip | `Tip` |
| Type discount | `Discount` |
| Type other | `Other` |
| Label field | `Label` |
| Label placeholder | `Example: Corkage fee` |
| Amount field | `Amount` |
| Discount helper | `Discounts reduce the bill.` |
| Allocation field | `How should this be divided?` |
| Save action | `Save adjustment` |
| Delete action | `Delete adjustment` |
| Invalid amount | `Enter a valid non-zero amount.` |
| Custom mismatch | `Custom amounts must add up to {amount}.` |

### 13.17 Continue-with-difference confirmation

| Element | Copy |
|---|---|
| Heading | `The totals don't match` |
| Body | `The current total differs from the receipt by {difference}. Check the items and adjustments before continuing.` |
| Review action | `Review bill` |
| Continue action | `Continue anyway` |

### 13.18 Summary — `/bill/[billId]/summary`

| Element | Copy |
|---|---|
| Heading | `Everyone's share` |
| Total label | `Bill total` |
| Match success | `Matches the receipt` |
| Mismatch status | `Does not match the receipt` |
| Participant owes | `{name} owes` |
| Items subheading | `Items` |
| Adjustments subheading | `Fees and discounts` |
| Shared item suffix | `shared` |
| Save action for draft | `Finish and save` |
| Share action | `Share summary` |
| Copy action | `Copy breakdown` |
| Edit action | `Edit bill` |
| Copied toast | `Breakdown copied.` |
| Saved toast | `Bill saved.` |
| Share failure | `We couldn't open the share menu. Try copying the breakdown instead.` |

### 13.19 Saved bill detail — `/bill/[billId]`

| Element | Copy |
|---|---|
| Edit action | `Edit bill` |
| Share action | `Share summary` |
| Delete action | `Delete bill` |
| Receipt action | `View receipt` |
| Raw OCR action | `View extracted text` |
| No receipt text | `This bill was entered manually.` |

### 13.20 Settings — `/settings`

| Element | Copy |
|---|---|
| Heading | `Settings` |
| Privacy section | `Privacy` |
| Privacy body | `Splitsy stores receipt images, extracted text, and bill history on this device. The MVP does not upload them to a Splitsy server.` |
| Data section | `Local data` |
| Delete all action | `Delete all local data` |
| Delete all heading | `Delete all Splitsy data?` |
| Delete all body | `This permanently removes every saved bill, draft, receipt image, and setting from this device.` |
| Delete all confirm | `Delete everything` |
| Delete all cancel | `Cancel` |
| Version label | `Version` |
| About section | `About Splitsy` |
| About body | `Scan a receipt, assign the items, and split the total clearly.` |

---

## 14. Global Error, Loading, Empty, and Confirmation Copy

| Scenario | Copy |
|---|---|
| Generic error heading | `Something went wrong` |
| Generic error body | `Try again. Your saved bills are still on this device.` |
| Retry action | `Try again` |
| Cancel action | `Cancel` |
| Done action | `Done` |
| Save action | `Save` |
| Continue action | `Continue` |
| Back accessibility label | `Go back` |
| Close accessibility label | `Close` |
| Loading bills | `Loading bills…` |
| Saving | `Saving…` |
| Saved | `Saved` |
| Database startup failure | `Splitsy couldn't open its local data. Restart the app and try again.` |
| Image-copy failure | `We couldn't save this receipt image. Choose it again or enter the bill manually.` |
| Unsupported image | `This image couldn't be opened. Choose a different photo.` |
| OCR unavailable | `Receipt scanning isn't available on this device right now. You can still enter the bill manually.` |
| Storage failure | `We couldn't save your changes. Check your available storage and try again.` |
| Delete failure | `We couldn't delete this bill. Try again.` |
| Unsaved changes heading | `Discard your changes?` |
| Unsaved changes body | `Changes since the last save will be lost.` |
| Keep editing | `Keep editing` |
| Discard | `Discard changes` |

Use inline validation near fields. Do not rely only on toast messages for important errors.

---

## 15. Screen Behavior and Navigation Rules

### Draft progression

A draft's recommended next route is based on its content:

1. No items -> receipt review/manual item entry.
2. Fewer than two participants -> participants.
3. Unassigned items -> assignments.
4. Adjustments not reviewed or unresolved validation -> adjustments.
5. Otherwise -> summary.

### Back navigation

- Draft changes are auto-saved.
- Back navigation should not repeatedly warn when the latest state is saved.
- Leaving camera or preview before a bill is created does not need a draft.
- Leaving an existing draft returns to home with the draft preserved.

### Completed bill editing

- Opening **Edit bill** changes the bill to `DRAFT` or starts an edit session that behaves like a draft.
- Recalculate all participant totals after edits.
- The user must return to summary and choose **Finish and save** again.

---

## 16. Reusable UI Components

Create a small consistent UI system rather than duplicating styles.

### Required primitives

- `Screen`
- `AppText`
- `AppButton` with primary, secondary, text, and destructive variants
- `IconButton`
- `AppTextInput`
- `AmountInput`
- `NumberStepper` or quantity field
- `SectionCard`
- `BottomActionBar`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `ConfirmationDialog`
- `InlineError`
- `StatusBadge`
- `Divider`

### Bill-specific components

- `BillListItem`
- `ReceiptImagePreview`
- `LineItemRow`
- `ParticipantChip`
- `ParticipantSelector`
- `AssignmentStatus`
- `AdjustmentRow`
- `ReconciliationCard`
- `PersonTotalCard`
- `SharePreview`

### Visual direction

- Friendly, practical, and calm.
- Large totals and clear hierarchy.
- Avoid dense accounting-style tables on small screens.
- Use cards and grouped rows.
- Do not rely on color alone to communicate assigned/unassigned or match/mismatch states.
- Keep the primary action fixed or easily reachable at the bottom where appropriate.

### Suggested design tokens

Use semantic tokens rather than hard-coded values:

- `background`
- `surface`
- `surfaceMuted`
- `textPrimary`
- `textSecondary`
- `border`
- `primary`
- `primaryPressed`
- `success`
- `warning`
- `danger`
- `focus`

The initial palette may use warm cream surfaces, dark brown text, and a warm gold primary color, but implementation must prioritize contrast and accessibility.

---

## 17. Accessibility Requirements

- Support screen-reader labels for icon-only controls.
- Use at least 44 x 44 point touch targets; prefer 48 x 48 where practical.
- Support system font scaling without clipping critical controls.
- Pair status colors with text and icons.
- Announce form errors and processing completion where platform APIs allow.
- Provide logical focus order.
- Ensure bottom actions remain reachable when the keyboard is visible.
- Currency labels should be understandable to screen readers, for example `520 pesos and 25 centavos` where practical.
- Do not put essential instructions only inside placeholder text.
- Camera guidance must have text, not only a visual frame.

---

## 18. Privacy and Security Requirements

- Do not upload receipt images or OCR text to a Splitsy server in the MVP.
- Do not request microphone, location, contacts, or notification permissions.
- Request camera or photo access only when the user selects the related action.
- Store only the data required for bill history.
- Delete app-owned receipt files when a bill is deleted.
- Use parameterized database queries through the ORM.
- Validate all OCR and form input.
- Do not log full receipt text or personally identifying receipt content in production builds.
- Development logging must be behind a development check and easy to disable.
- No API keys should exist in the mobile bundle for this MVP.
- No analytics SDK is required.

---

## 19. Performance and Reliability Requirements

- Show a loading state within 100 ms after starting OCR.
- Avoid loading full-resolution receipt images into multiple React component states.
- Resize very large images before OCR while preserving enough resolution for small receipt text.
- Run receipt parsing outside render functions.
- Memoize derived totals where useful, but prefer correctness and clear code over premature optimization.
- Database writes should be transactional when updating related bill data.
- Cascade-delete child rows.
- Keep draft saves idempotent.
- Handle app restarts during an incomplete draft.
- Never lose the manually corrected data because OCR is re-run.
- Re-running OCR must require confirmation because it can replace receipt-derived fields.

---

## 20. Testing Strategy

### 20.1 Required unit tests

#### Money utilities

- Parse common PHP strings.
- Reject malformed values.
- Format zero, positive, and negative amounts.
- Avoid floating-point drift.

#### Equal splitting

- Even division.
- Remainder centavos.
- Stable remainder recipient ordering.
- One participant.
- Large values within safe limits.

#### Proportional allocation

- Typical proportions.
- Remainder allocation.
- Negative discounts.
- Zero subtotal fallback.
- Sum invariant.

#### Custom allocation

- Exact balance.
- Under-allocation.
- Over-allocation.
- Sign mismatch.

#### Receipt parser

At minimum, fixtures should cover:

- Simple receipt with item lines and a total.
- Quantity and line total.
- Service charge and VAT.
- Discount.
- `CASH` and `CHANGE` after total.
- Multiple total-like lines.
- Wrapped item name.
- Comma-separated amounts.
- No total found.
- No items found.
- A date or transaction number that resembles an amount.
- Blurry or low-confidence lines represented in normalized fixture data.

#### Bill validation

- Fewer than two participants.
- Unassigned item.
- Invalid adjustment.
- Custom allocation mismatch.
- Unacknowledged discrepancy.
- Completed valid bill.

### 20.2 Component tests

- Receipt review displays detected items.
- Editing an item updates totals.
- Participant duplicate validation.
- Assignment screen blocks continuation with unassigned items.
- Adjustment screen shows a mismatch.
- Summary renders participant totals and line shares.

### 20.3 Manual acceptance tests

Test on at least:

- One mid-range Android physical device.
- One Android emulator.
- Several real Philippine receipts with different layouts.
- One long receipt.
- One low-light receipt.
- One gallery image.
- One completely manual bill.
- App restart while a draft exists.
- Share to at least one installed messaging or notes app.

### 20.4 Test fixture privacy

Use synthetic or deliberately anonymized receipt fixtures in the repository. Do not commit real card numbers, customer names, phone numbers, or transaction identifiers.

---

## 21. Definition of Done for the MVP

The MVP is complete only when all of the following are true:

- The application runs in an Expo development build on Android.
- Camera, gallery, and manual entry paths work.
- On-device OCR is integrated behind an adapter.
- Receipt review is mandatory.
- At least two participants can be added.
- Every item can be assigned to one or more people.
- Shared item amounts split exactly.
- Adjustments support proportional, equal, and custom allocation.
- Participant totals sum exactly to the computed bill total.
- Receipt discrepancies are visible and require resolution or acknowledgement.
- Drafts and completed bills survive app restarts.
- Text sharing works through the native share sheet.
- Deleting a bill removes its local rows and receipt files.
- Core parser and splitting tests pass.
- Type checking passes.
- Linting passes.
- No receipt data is uploaded to an application server.
- There are no hard-coded secrets.
- The README contains setup, development-build, migration, test, and verification instructions.

---

## 22. Recommended Implementation Milestones

Claude Code should turn these milestones into a detailed plan with small, verifiable tasks.

### Milestone 0 — Repository and OCR spike

- Scaffold Expo TypeScript app.
- Configure Expo Router and development build.
- Add lint, formatting, type-check, and test commands.
- Define OCR adapter contracts.
- Prove receipt OCR on Android.
- Record limitations and selected package version.

### Milestone 1 — Design system and local database

- Add theme tokens and UI primitives.
- Define Drizzle schema and migrations.
- Implement bill repositories.
- Add app startup migration handling.
- Add home empty state and bill list.

### Milestone 2 — New bill and receipt capture

- Source selection.
- Camera permissions and capture.
- Gallery picker.
- App-owned image storage.
- Preview and rotation.
- Manual entry path.

### Milestone 3 — OCR pipeline and receipt review

- OCR processing states.
- Native OCR result normalization.
- Rule-based parser.
- Parser fixtures and tests.
- Save parsed draft.
- Receipt review and item editing.
- Raw-text viewer.

### Milestone 4 — Participants and assignments

- Participant CRUD and validation.
- Assignment UI.
- Shared-item calculation.
- Unassigned-item blocking.
- Autosave.

### Milestone 5 — Adjustments and reconciliation

- Adjustment CRUD.
- Proportional, equal, and custom allocation.
- Deterministic rounding.
- Total reconciliation.
- Difference-as-adjustment action.
- Calculation and validation tests.

### Milestone 6 — Summary, history, sharing, and settings

- Participant breakdown.
- Save completed bill.
- Bill history and resume flow.
- Native text sharing and clipboard copy.
- Delete bill and delete all data.
- Privacy and about copy.

### Milestone 7 — Hardening and release readiness

- Accessibility pass.
- Error-state pass.
- Physical-device receipt testing.
- Performance and image-memory review.
- README and architecture notes.
- Final lint, test, and type-check verification.

---

## 23. Claude Code Instructions

When this document is provided to Claude Code, follow this process:

1. Inspect the repository before proposing changes.
2. Treat this specification as the source of truth for MVP scope.
3. Create `PLAN.md` before implementing the complete product.
4. In `PLAN.md`, include:
   - Current repository assessment.
   - Architecture decisions.
   - Dependency list and why each dependency is needed.
   - OCR compatibility-spike steps.
   - Database schema and migration approach.
   - Route map.
   - Milestones broken into small tasks.
   - Test plan.
   - Risks and fallback options.
5. Prefer the simplest architecture that preserves the boundaries in this document.
6. Do not introduce a backend, authentication, cloud OCR, or an LLM.
7. Do not code the complete app before the OCR spike is proven.
8. Keep the OCR bridge replaceable.
9. Keep parser and split-calculation logic pure and heavily tested.
10. Store all money as integer centavos.
11. Centralize user-facing copy.
12. Use database migrations rather than creating tables ad hoc in screens.
13. After each milestone, run the available lint, type-check, and test commands.
14. Update `PLAN.md` with completed work, deviations, and discovered risks.
15. Do not silently expand the scope. Put non-MVP ideas in `FUTURE.md`.

### First response expected from Claude Code

Claude Code's first response should not be a large code dump. It should provide:

- A concise repository assessment.
- Any blocking compatibility concern.
- The proposed `PLAN.md` outline.
- The first milestone it will execute: repository setup and OCR spike.

---

## 24. Known Risks and Required Mitigations

### Risk: OCR bridge compatibility with the latest Expo SDK

**Mitigation:** Perform the spike first and isolate the bridge behind `ReceiptOcrService`.

### Risk: OCR text is readable but item grouping is wrong

**Mitigation:** Use geometry-aware parsing, preserve raw lines, and require manual review.

### Risk: Receipt formats vary widely

**Mitigation:** Keep the parser rule-based and test-driven. Do not promise perfect automatic extraction.

### Risk: Floating-point rounding creates incorrect totals

**Mitigation:** Store integer centavos and use deterministic remainder allocation.

### Risk: Selected gallery image URI becomes invalid

**Mitigation:** Copy the image into app-owned storage immediately.

### Risk: Large receipt images cause memory issues

**Mitigation:** Keep the original on disk and create a resized OCR derivative. Avoid base64 unless absolutely required.

### Risk: User removes a participant with assignments

**Mitigation:** Confirm removal and cascade-delete the participant's assignments and custom allocations.

### Risk: OCR replaces manual corrections

**Mitigation:** Never re-run OCR automatically after review. Require explicit confirmation before reprocessing.

### Risk: A receipt's total cannot be reconciled

**Mitigation:** Show the discrepancy, offer a reconciliation adjustment, and allow acknowledged continuation.

---

## 25. Future Enhancements — Not for MVP Implementation

Store these ideas in `FUTURE.md`; do not implement them now.

- Optional account and cloud backup.
- Hono API for sync and shareable bill links.
- Participants joining through a QR code or web link.
- Collaborative item claiming.
- GCash or Maya payment links.
- Payment status tracking.
- Multi-currency support.
- Multiple receipt pages.
- Document-edge detection and perspective correction.
- Better image enhancement.
- Merchant-specific parser templates.
- Optional LLM fallback for difficult receipts.
- Export as image or PDF.
- Recurring groups.
- Contact suggestions.
- Expense history insights.
- Receipt categories.
- Dark mode if not included initially.
- Localization for Filipino and other languages.

---

## 26. Technical Reference Notes

The technology choices in this specification are based on the following official project capabilities:

- Expo supports React Native development for Android and iOS and recommends development builds for production-grade projects that need custom native modules.
- Expo Router provides file-based routing for Expo and React Native projects.
- Expo Camera, Image Picker, Image Manipulator, File System, and SQLite provide the required device and local-storage capabilities.
- Google ML Kit Text Recognition v2 recognizes Latin-script text, supports receipt use cases, and returns structured text such as blocks and lines with geometry and confidence data.
- The selected React Native ML Kit bridge exposes on-device text recognition and structured results but must be validated against the current Expo SDK.
- Drizzle provides an Expo SQLite driver and migration workflow.
- React Hook Form supports React Native controlled inputs.
- Zod provides TypeScript-first runtime validation.

Do not pin package versions from this document. Resolve versions from the current stable Expo SDK and verify them in the lockfile and development build.

---

## 27. Final MVP Checklist

- [ ] Expo development build configured.
- [ ] OCR compatibility spike passed on Android.
- [ ] OCR adapter implemented.
- [ ] Camera capture works.
- [ ] Gallery import works.
- [ ] Manual entry works.
- [ ] Receipt image is copied to app storage.
- [ ] OCR text and geometry are normalized.
- [ ] Rule-based parser has fixtures and tests.
- [ ] Receipt review and item editing work.
- [ ] Participants can be managed.
- [ ] Every item can be assigned.
- [ ] Shared items split exactly.
- [ ] Adjustments support three allocation methods.
- [ ] Receipt reconciliation works.
- [ ] Summary totals are exact.
- [ ] Share and copy work.
- [ ] Drafts and completed bills persist.
- [ ] Delete bill cleans files and rows.
- [ ] Delete all local data works.
- [ ] Accessibility pass completed.
- [ ] Error copy implemented.
- [ ] Lint passes.
- [ ] Type checking passes.
- [ ] Tests pass.
- [ ] README completed.
- [ ] No backend, paid AI, or cloud OCR introduced.


import appInfo from './appInfo.json';

// Centralized user-facing copy (spec sections 13/14), filled in one screen at a
// time as each is built. Section numbers below refer to the spec.
export const copy = {
  appName: appInfo.name,

  // Section 13.2 — Home
  home: {
    // Not from the spec — the greeting header (see the app-header task
    // notes): a personal "Hi {name}!" heading in place of the old plain
    // "Bills" page title, with a wordmark + settings-avatar row above it.
    // `{name}` is filled from the signed-in session's own display name
    // (authClient.useSession() — never a route param), falling back to
    // fallbackName on the practically-unreachable case of an empty one
    // (registration already requires a non-empty name).
    greeting: 'Hi {name}! 👋',
    greetingSubtitle: 'Got any bill to split for me?',
    fallbackName: 'there',
    // The old plain "Bills" page title this header replaced was never
    // spec-mandated exact text (not referenced anywhere in
    // docs/Splitsy_MVP_Spec.md) — removed rather than left as dead copy.
    primaryAction: 'New bill',
    emptyHeading: 'No bills yet',
    emptyBody: 'Scan a receipt or enter items manually to create your first split.',
    emptyCta: 'Split a bill',
    draftBadge: 'Draft',
    completedBadge: 'Completed',
    unknownMerchantTitle: 'Untitled bill',
    resumeAction: 'Continue',
    openAction: 'View split',
    overflowEdit: 'Edit bill',
    overflowShare: 'Share summary',
    overflowDelete: 'Delete bill',
    overflowAccessibilityLabel: 'More actions',
    // Not from the spec — the visual revamp's reference-inspired "Recent"
    // section label above the bill/trip list (see the visual-revamp task
    // notes). This list already shows every bill/trip, so unlike the
    // reference UI there's no accompanying "See all" action.
    recentSectionTitle: 'Recent',
    // Not spec-mandated exact text (13.2 names the "Delete bill" overflow
    // action only, not its confirmation copy) — same treatment as
    // itemEditor's/adjustmentEditor's/savedBillDetail's own delete-confirmation
    // pairs.
    deleteConfirmHeading: 'Delete this bill?',
    deleteConfirmBody:
      'This permanently removes the bill, its receipt image, and everyone’s shares from this device.',
    // Shown instead of attempting Share on a draft that isn't far enough
    // along to compute a split yet (spec doesn't cover this edge case).
    shareUnavailable: 'Add participants and assign items before sharing this bill.',
  },

  // Section 13.3 — New bill source
  newBill: {
    heading: 'Add a receipt',
    body: 'Choose the fastest way to start your split.',
    cameraTitle: 'Take a photo',
    cameraDescription: 'Best for a receipt in front of you.',
    galleryTitle: 'Choose from photos',
    galleryDescription: 'Use a receipt image already on your phone.',
    manualTitle: 'Enter items manually',
    manualDescription: 'Start without scanning a receipt.',
    // Not from the spec — a deliberate post-MVP addition (see PLAN.md), a
    // fourth entry point alongside the original three.
    quickSplitTitle: 'Split evenly',
    quickSplitDescription: 'Skip the receipt — enter a total and split it equally.',
    // Not from the spec — the Trip feature's fifth entry point (see the
    // 2026-08-18 spec Amendment and PLAN.md's "Post-MVP feature: Trips"
    // entry): a fork into /trip/new rather than a single bill, deliberately
    // placed on this same chooser screen instead of a second floating action
    // (BottomTabBar.tsx's own header comment is explicit that this app has
    // exactly one floating action, now the tab bar's own center button).
    tripTitle: 'Start a trip',
    tripDescription: 'Split several bills for the same trip with one shared list of people.',
    backConfirmHeading: 'Leave this bill?',
    backConfirmBody: 'Your progress has not been saved yet.',
    stayAction: 'Keep editing',
    leaveAction: 'Leave',
  },

  // Not from the spec — the Trip feature's own screens: trip creation
  // (/trip/new) and the trip hub (/trip/[tripId]) (see the 2026-08-18 spec
  // Amendment above docs/Splitsy_MVP_Spec.md's line 53, and PLAN.md's
  // "Post-MVP feature: Trips" entry). Mirrors this file's existing
  // participants/participantEditor naming pattern, since a trip's roster
  // editor reuses the exact same add/remove/duplicate-name UX.
  trip: {
    newHeading: 'Start a trip',
    newBody:
      'Add everyone sharing this trip. Every bill you scan into it will start with this same list of people.',
    nameLabel: 'Trip name (optional)',
    namePlaceholder: 'Example: Baguio weekend',
    rosterHeading: "Who's on this trip?",
    addAction: 'Add person',
    quickAddMe: 'Add me',
    minimumError: 'Add at least 2 people to continue.',
    emptyHeading: 'No one added yet',
    emptyBody: 'Add everyone sharing this trip to get started.',
    removeConfirmHeading: 'Remove {name} from this trip?',
    removeConfirmBody:
      'They will no longer be added automatically to bills you scan into this trip.',
    removeAction: 'Remove person',
    startTripAction: 'Start trip',
    unknownTripTitle: 'Untitled trip',
    activeBadge: 'Active',
    settledBadge: 'Settled',
    billCountLabel: '{count} bills',
    rosterSectionTitle: 'Trip roster',
    billsSectionTitle: 'Bills in this trip',
    tripTotalLabel: 'Completed so far',
    scanNextBillAction: 'Scan next bill',
    chooseFromGalleryAction: 'Choose from photos',
    settleUpAction: 'Settle up',
    emptyBillsHeading: 'No bills yet',
    emptyBillsBody: 'Scan your first receipt to start this trip.',
    deleteTripAction: 'Delete trip',
    deleteConfirmHeading: 'Delete this trip?',
    deleteConfirmBody:
      'This permanently removes the trip and all {count} bills in it, including their receipt images.',
  },

  // Not from the spec — the quick-split entry screen (see PLAN.md's
  // post-MVP "Payments and quick split" entry).
  quickSplit: {
    heading: 'Split the bill evenly',
    body: 'Enter the total — you can add people next.',
    totalLabel: 'Total amount',
    titleLabel: "What's this for?",
    titlePlaceholder: 'Example: Dinner with friends',
    continueButton: 'Add people',
    invalidAmountError: 'Enter a valid amount.',
  },

  // Section 13.4 — Camera permission state
  cameraPermission: {
    heading: 'Allow camera access',
    body: 'Splitsy uses your camera only to photograph the receipt.',
    primaryButton: 'Allow camera',
    galleryAlternative: 'Choose from photos instead',
    manualAlternative: 'Enter items manually',
    permanentDenialBody:
      'Camera access is turned off. Enable it in your phone settings, or choose another way to add the receipt.',
    settingsButton: 'Open settings',
  },

  // Section 13.5 — Camera capture
  cameraCapture: {
    instruction: 'Fit the whole receipt inside the frame.',
    tip: 'Keep it flat, well lit, and in focus.',
    captureAccessibilityLabel: 'Take receipt photo',
    flashAuto: 'Flash: Auto',
    flashOn: 'Flash: On',
    flashOff: 'Flash: Off',
    galleryAction: 'Photos',
    closeAccessibilityLabel: 'Close camera',
  },

  // Section 13.6 — Receipt preview
  preview: {
    heading: 'Check the photo',
    body: 'Make sure the item names and prices are easy to read.',
    primaryButton: 'Use this photo',
    retakeAction: 'Retake',
    chooseAnotherAction: 'Choose another',
    rotateAction: 'Rotate',
  },

  // Section 13.7 — Processing
  processing: {
    heading: 'Reading your receipt…',
    body: 'This can take a few seconds.',
    privacyNote: 'Text extraction happens on this device.',
    stagePreparing: 'Preparing image',
    stageReading: 'Finding text',
    stageOrganizing: 'Organizing items and totals',
    cancelAction: 'Cancel',
  },

  // Section 13.8 — OCR failure
  ocrFailure: {
    heading: "We couldn't read this receipt",
    body: 'Try a clearer photo, or enter the items manually.',
    retryButton: 'Try again',
    anotherPhotoButton: 'Use another photo',
    manualButton: 'Enter items manually',
    technicalDetailsAction: 'View extracted text',
    noTextDetail: 'No readable text was found.',
  },

  // Section 13.9 — Receipt review
  receiptReview: {
    heading: 'Review receipt',
    body: 'Check the items and prices before continuing.',
    detectedCountSingular: 'We found 1 item.',
    detectedCountPlural: 'We found {count} items.',
    merchantLabel: 'Merchant or bill name',
    merchantPlaceholder: 'Example: Dinner at Mesa',
    dateLabel: 'Receipt date',
    datePlaceholder: 'YYYY-MM-DD',
    invalidDateError: 'Enter the date as YYYY-MM-DD.',
    itemsSection: 'Items',
    itemQuantityLabel: 'Qty {quantity}',
    addItem: 'Add item',
    detectedSubtotalLabel: 'Receipt subtotal',
    itemSubtotalLabel: 'Items subtotal',
    detectedTotalLabel: 'Receipt total',
    computedTotalLabel: 'Current total',
    matchSuccess: 'The current total matches the receipt.',
    mismatchWarning: 'The current total is {difference} {higherOrLower} than the receipt.',
    higherWord: 'higher',
    lowerWord: 'lower',
    rawTextAction: 'Extracted text',
    // Deliberately its own key rather than reusing
    // copy.savedBillDetail.receiptAction ('View receipt') — that string is
    // shared by the saved-bill-detail screen's own button and modal, and
    // this screen wanting shorter label text shouldn't also shorten that
    // other screen's.
    receiptAction: 'Receipt',
    ocrSourceBackend: 'Read online (higher accuracy)',
    ocrSourceOnDevice: 'Read on-device (offline)',
    handwritingNote:
      'Handwritten receipts are read on a best-effort basis and may be less accurate — please double-check items and prices.',
    rateLimitedNote:
      'Online scanning was too busy just now, so this receipt was read on-device instead — please double-check items and prices, or try again in a minute for higher accuracy.',
    continueButton: 'Add people',
    noItemsHeading: 'No items found',
    noItemsBody: 'Add the receipt items manually to continue.',
  },

  // Section 13.10 — Add/edit item sheet
  itemEditor: {
    addHeading: 'Add item',
    editHeading: 'Edit item',
    nameLabel: 'Item name',
    namePlaceholder: 'Example: Chicken meal',
    quantityLabel: 'Quantity',
    amountLabel: 'Line total',
    amountPlaceholder: '0.00',
    saveAction: 'Save item',
    deleteAction: 'Delete item',
    cancelAction: 'Cancel',
    requiredNameError: 'Enter an item name.',
    invalidQuantityError: 'Quantity must be a whole number from 1 to 99.',
    invalidAmountError: 'Enter a valid amount.',
    deleteConfirmHeading: 'Delete this item?',
    deleteConfirmBody: 'This item and its assignments will be removed.',
  },

  // Section 13.11 — Participants
  participants: {
    heading: "Who's splitting this bill?",
    body: 'Add everyone who should receive a share.',
    addAction: 'Add person',
    quickAddMe: 'Add me',
    continueButton: 'Assign items',
    minimumError: 'Add at least 2 people to continue.',
    emptyHeading: 'No one added yet',
    emptyBody: 'Start by adding yourself and the other people sharing the bill.',
    removeConfirmHeading: 'Remove {name}?',
    removeConfirmBody: 'Their item assignments and custom adjustment amounts will also be removed.',
    removeAction: 'Remove person',
  },

  // Section 13.12 — Add/edit participant sheet
  participantEditor: {
    addHeading: 'Add person',
    editHeading: 'Edit person',
    nameLabel: 'Name',
    namePlaceholder: 'Example: Alex',
    saveAction: 'Save person',
    cancelAction: 'Cancel',
    requiredNameError: 'Enter a name.',
    duplicateNameError: 'That name is already in this bill.',
    tooLongNameError: 'Use 30 characters or fewer.',
  },

  // Section 13.13 — Item assignment
  assignments: {
    heading: 'Who had what?',
    body: 'Choose one or more people for every item.',
    sharedNote: 'Items assigned to more than one person are split equally.',
    // Not from the spec — the post-MVP "split evenly" toggle (see PLAN.md):
    // lets an itemized bill switch to an equal split, and reflects a
    // quick-split bill's already-equal split back to the user.
    splitEquallyToggleLabel: 'Split everything equally',
    unassignedSection: 'Unassigned',
    assignedSection: 'Assigned',
    assignAction: 'Choose people',
    multiPersonState: 'Shared by {count}',
    noAssignmentState: 'Not assigned',
    bulkAssignAction: 'Assign all unassigned',
    continueButton: 'Review fees and discounts',
    blockingErrorHeading: 'Assign every item',
    blockingErrorBody: '{count} {itemWord} still need {assignmentWord}.',
    itemWordSingular: 'item',
    itemWordPlural: 'items',
    assignmentWordSingular: 'an assignment',
    assignmentWordPlural: 'assignments',
  },

  // Section 13.14 — Participant picker sheet
  participantPicker: {
    heading: 'Who shared this item?',
    body: 'Select everyone who should pay for it.',
    selectAll: 'Select all',
    clear: 'Clear',
    saveAction: 'Save assignment',
    requiredError: 'Choose at least one person.',
  },

  // Section 13.15 — Adjustments
  adjustments: {
    heading: 'Fees, tax, and discounts',
    body: 'Check the extra amounts and choose how to split them.',
    addAction: 'Add adjustment',
    emptyHeading: 'No extra amounts',
    emptyBody: 'Add tax, service charge, tip, discount, or another amount when needed.',
    allocationProportional: 'Proportional to items',
    allocationProportionalDetail: 'People with larger item totals pay a larger share.',
    allocationEqual: 'Split equally',
    allocationEqualDetail: 'Everyone gets the same share.',
    allocationCustom: 'Enter custom amounts',
    allocationCustomDetail: 'Set the exact amount for each person.',
    itemSubtotalLabel: 'Items subtotal',
    adjustmentsTotalLabel: 'Adjustments',
    computedTotalLabel: 'Current total',
    receiptTotalLabel: 'Receipt total',
    matchSuccess: 'Everything matches the receipt.',
    differenceWarning: "There's a {difference} difference.",
    addDifferenceAction: 'Add difference as an adjustment',
    reviewItemsAction: 'Review items',
    continueButton: "See everyone's share",
    continueWithDifferenceAction: 'Continue with difference',
    // Not spec-mandated exact copy (the spec leaves this auto-created
    // adjustment's label to implementation judgment) — shown as the `label`
    // of the OTHER adjustment created by "Add difference as an adjustment"
    // (spec 10.8).
    autoAdjustmentLabel: 'Receipt total difference',
  },

  // Section 13.16 — Add/edit adjustment sheet
  adjustmentEditor: {
    addHeading: 'Add adjustment',
    editHeading: 'Edit adjustment',
    typeLabel: 'Type',
    typeTax: 'Tax',
    typeService: 'Service charge',
    typeTip: 'Tip',
    typeDiscount: 'Discount',
    typeOther: 'Other',
    labelField: 'Label',
    labelPlaceholder: 'Example: Corkage fee',
    amountField: 'Amount',
    discountHelper: 'Discounts reduce the bill.',
    allocationField: 'How should this be divided?',
    saveAction: 'Save adjustment',
    deleteAction: 'Delete adjustment',
    invalidAmount: 'Enter a valid non-zero amount.',
    customMismatch: 'Custom amounts must add up to {amount}.',
    // Not spec-mandated exact copy — spec 13.16 only names `customMismatch`
    // for the sum-out-of-balance case; this covers validateCustomAllocation's
    // separate `signMismatch` reason (spec 10.6's sign rule), which the
    // custom-amount UI here can't actually trigger (every entry is signed to
    // match the adjustment automatically) but is still handled defensively.
    customSignMismatchError: "Custom amounts must be zero or match the adjustment's direction.",
    // Not spec-mandated exact copy — spec 13.16 doesn't give delete
    // confirmation text for adjustments the way itemEditor's
    // deleteConfirmHeading/Body do; mirrors that same pair's wording.
    deleteConfirmHeading: 'Delete this adjustment?',
    deleteConfirmBody: 'This amount will no longer be included in the split.',
  },

  // Section 13.17 — Continue-with-difference confirmation
  continueWithDifference: {
    heading: "The totals don't match",
    body: 'The current total differs from the receipt by {difference}. Check the items and adjustments before continuing.',
    reviewAction: 'Review bill',
    continueAction: 'Continue anyway',
  },

  // Not from the spec — the payments/contributions screen, inserted between
  // Adjustments and Summary (see PLAN.md's post-MVP "Payments and quick
  // split" entry).
  payments: {
    heading: 'Who paid?',
    body: 'Add how much each person actually paid. Splitsy will work out who owes who.',
    fullAmountAction: 'Paid in full',
    skipAction: 'Skip for now',
    continueButton: 'Continue',
    unaccountedNote: "{amount} of the bill hasn't been marked as paid yet.",
    overCollectedNote: "{amount} more was marked as paid than the bill's total.",
    // Not from the spec — a direct entry point to the Payments screen from
    // Summary, reachable regardless of draft-progression state (see
    // resolveNextRoute.ts's header comment on why Payments isn't part of that
    // routing logic), so returning to a bill after skipping Payments once
    // doesn't permanently lock the user out of it.
    editAction: 'Edit payments',
    // Not from the spec — the visual revamp's per-person paid-vs-owed
    // progress bar on PersonTotalCard (see the theme direction notes: status
    // is conveyed by this label text, never by the bar's color alone).
    progressPaidInFull: 'Paid in full',
    progressPartial: '{paid} of {total} paid',
  },

  // Not from the spec — settlement ("who owes whom") display on the Summary
  // screen, computed from Payments (see PLAN.md's post-MVP entry).
  settlement: {
    heading: 'Settle up',
    owesLabel: '{debtor} owes {creditor}',
    allSettled: "Everyone's settled up.",
    // Not from the spec — the visual revamp's overall collected-vs-total
    // progress bar on SettlementCard (status is conveyed by this label text,
    // never by the bar's color alone).
    collectedLabel: '{collected} of {total} collected',
  },

  // Not from the spec — the Trip feature's combined multi-bill settlement
  // screen (/trip/[tripId]/settlement), aggregating every COMPLETED bill in a
  // trip into one "who owes who" via computeTripSettlement.ts (see the
  // 2026-08-18 spec Amendment and PLAN.md's "Post-MVP feature: Trips" entry).
  // Reuses `settlement.owesLabel`/`allSettled`/`collectedLabel` and
  // `summary.participantOwes`/`payments.progressPaidInFull`/
  // `progressPartial` as-is (SettlementCard/the per-person balance card below
  // are generic over whose id they're showing), rather than duplicating that
  // same generic copy under a second name.
  tripSettlement: {
    heading: 'Trip settlement',
    tripTotalLabel: 'Trip total',
    emptyHeading: 'Nothing to settle yet',
    emptyBody: 'Complete at least one bill in this trip to see a combined settlement.',
    markSettledAction: 'Mark trip settled',
    settledToast: 'Trip marked as settled.',
    // Not from the spec — Trip feature addition: each person's card can
    // expand to show every item they're assigned to across the trip's bills.
    viewItemsAction: 'View items',
    hideItemsAction: 'Hide items',
    // Appended to a shared item's name, e.g. "Nachos (split with Sam, Jo)" —
    // named co-assignees, not just a generic "(shared)" suffix, since this
    // view spans multiple bills where "shared" alone doesn't say with whom.
    itemSharedWithSuffix: 'split with {names}',
    paidLabel: 'Paid',
  },

  // Section 13.18 — Summary
  summary: {
    heading: "Everyone's share",
    body: "Review each person's total, then share or save the bill.",
    totalLabel: 'Bill total',
    matchSuccess: 'Matches the receipt',
    mismatchStatus: 'Does not match the receipt',
    participantOwes: '{name} owes',
    itemsSubheading: 'Items',
    adjustmentsSubheading: 'Fees and discounts',
    sharedSuffix: 'shared',
    saveAction: 'Finish and save',
    shareAction: 'Share summary',
    copyAction: 'Copy breakdown',
    editAction: 'Edit bill',
    copiedToast: 'Breakdown copied.',
    savedToast: 'Bill saved.',
    shareFailure: "We couldn't open the share menu. Try copying the breakdown instead.",
    // Not from the spec — Trip feature addition (see the 2026-08-18 spec
    // Amendment). Deliberately a prominent secondary button, matching
    // savedBillDetail.tripLinkLabel's same treatment on the screen "Finish
    // and save" lands on — obvious both before and after saving, not just
    // on Summary.
    backToTripAction: 'Back to {name}',
  },

  // Section 13.19 — Saved bill detail
  savedBillDetail: {
    editAction: 'Edit bill',
    shareAction: 'Share summary',
    deleteAction: 'Delete bill',
    receiptAction: 'View receipt',
    rawOcrAction: 'View extracted text',
    noReceiptText: 'This bill was entered manually.',
    // Not spec-mandated exact text (13.19 names the "Delete bill" button only,
    // not its confirmation copy) — same treatment as itemEditor's/
    // adjustmentEditor's own delete-confirmation pairs.
    deleteConfirmHeading: 'Delete this bill?',
    deleteConfirmBody:
      'This permanently removes the bill, its receipt image, and everyone’s shares from this device.',
    // Not from the spec — the Trip feature addition (see the 2026-08-18 spec
    // Amendment): shown only when this bill's `tripId` is set, linking back
    // to the trip hub. This is the screen "Finish and save" lands on, so the
    // wording/prominence deliberately matches summary.backToTripAction below
    // rather than reading as a passive info label — the user wants this
    // obvious both before and after saving, not just on Summary.
    tripLinkLabel: 'Back to {name}',
  },

  // Section 13.20 — Settings
  settings: {
    heading: 'Settings',
    // Not from the spec — the visual revamp's manual light/dark override
    // (defaults to following the system setting; see ThemeProvider.tsx).
    appearanceSection: 'Appearance',
    appearanceSystem: 'Match system',
    appearanceLight: 'Light',
    appearanceDark: 'Dark',
    privacySection: 'Privacy',
    // Deliberately not spec 13.20's literal text ("...does not upload them to
    // a Splitsy server") — the 2026-07-31 spec Amendment means that's no
    // longer accurate: a receipt photo may transit Splitsy's own backend for
    // OCR extraction. This says what's still true (everything confirmed
    // stays local, nothing is stored server-side) instead of a now-false
    // claim. See the Amendment callout at the top of
    // docs/Splitsy_MVP_Spec.md for the full rationale.
    privacyBody:
      'Splitsy stores receipt images, extracted text, and bill history on this device. A photo may briefly be sent to Splitsy’s own text-reading service to read it, then deleted there immediately — nothing is stored on a server, and your confirmed bill always stays on this device.',
    dataSection: 'Local data',
    deleteAllAction: 'Delete all local data',
    deleteAllHeading: 'Delete all Splitsy data?',
    deleteAllBody:
      'This permanently removes every saved bill, draft, receipt image, and setting from this device.',
    deleteAllConfirm: 'Delete everything',
    deleteAllCancel: 'Cancel',
    versionLabel: 'Version',
    aboutSection: 'About Splitsy',
    aboutBody: 'Scan a receipt, assign the items, and split the total clearly.',
  },

  // Not from the spec — the persistent bottom tab bar (Home/Settings plus a
  // floating "+" for starting a new bill/trip) added on top of the spec's own
  // per-screen header navigation. Scope deliberately reduced from the
  // reference UI this was modeled on (which shows four tabs) to just these
  // two real destinations, confirmed directly by the user.
  nav: {
    homeTab: 'Home',
    settingsTab: 'Settings',
    // The center "+" button's accessibility label deliberately reuses
    // copy.home.primaryAction ('New bill') below rather than duplicating a
    // near-identical string here — see BottomTabBar.tsx's own usage.
  },

  // Not from the spec — the account system added by the 2026-08-25 spec
  // Amendment (docs/Splitsy_MVP_Spec.md, and PLAN.md's "Post-MVP feature:
  // Account system (Better Auth)" entry). Section 13 predates this feature,
  // so there is no exact-copy contract to match here — this copy is
  // original, following this file's own tone and per-screen grouping
  // elsewhere. Covers the (auth) route group's four screens
  // (sign-in/register/forgot-password/reset-password), the root layout's
  // session-gating states, and the Settings screen's new "Log out" action.
  auth: {
    // Sign in — src/app/(auth)/sign-in.tsx
    signInHeading: 'Sign in to Splitsy',
    signInBody: 'Sign in to continue splitting bills.',
    signInButton: 'Sign in',
    signInNoAccountPrompt: "Don't have an account?",
    signInRegisterLink: 'Create one',
    forgotPasswordLink: 'Forgot password?',
    // Better Auth deliberately returns the same error whether the email
    // doesn't exist or the password is wrong (spec-parallel to
    // requestPasswordReset's own "don't reveal whether the email exists"
    // behavior) — so there is exactly one message to show here, not a
    // per-cause one.
    signInInvalidCredentials: 'Incorrect email or password. Try again.',
    // requireEmailVerification (2026-08-25 security review, Vuln 3) blocks
    // sign-in with EMAIL_NOT_VERIFIED for a correct password on an
    // unverified account — a distinct case from signInInvalidCredentials
    // above, so it gets its own message and a way to recover from it.
    signInEmailNotVerified: "You'll need to verify your email before signing in.",
    resendVerificationAction: 'Resend verification email',
    resendVerificationSentToast: "We've sent another verification email.",

    // Register — src/app/(auth)/register.tsx
    registerHeading: 'Create your account',
    registerBody: 'Create an account to start splitting bills.',
    nameLabel: 'Name',
    namePlaceholder: 'Example: Alex',
    registerButton: 'Create account',
    registerHasAccountPrompt: 'Already have an account?',
    registerSignInLink: 'Sign in',
    registerEmailInUse: 'An account with this email already exists.',
    // Shown instead of the form once sign-up succeeds — requireEmailVerification
    // means there's no session yet (Better Auth returns `token: null`), so
    // this screen can't rely on the root layout's session gate to move the
    // user along the way sign-in.tsx does; it has to say so explicitly.
    registerCheckEmailHeading: 'Check your email',
    registerCheckEmailBody:
      "We've sent a verification link to {email}. Open it on this device to finish creating your account, then sign in.",

    // Forgot password — src/app/(auth)/forgot-password.tsx
    forgotPasswordHeading: 'Reset your password',
    forgotPasswordBody:
      "Enter your account's email and we'll send you a link to reset your password.",
    sendResetLinkButton: 'Send reset link',
    // Better Auth's request-password-reset endpoint intentionally doesn't
    // reveal whether the email exists (same reasoning as
    // signInInvalidCredentials above) — this copy doesn't imply certainty
    // either, matching that.
    forgotPasswordConfirmation: "If that email exists, we've sent a reset link.",
    backToSignIn: 'Back to sign in',

    // Reset password — src/app/(auth)/reset-password.tsx
    resetPasswordHeading: 'Choose a new password',
    resetPasswordBody: 'Enter a new password for your account.',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm new password',
    resetPasswordButton: 'Reset password',
    resetPasswordSuccessToast: 'Your password has been reset. Sign in with your new password.',
    resetPasswordInvalidTokenError: 'This reset link is invalid or has expired. Request a new one.',
    resetPasswordMissingTokenHeading: "This link isn't working",
    resetPasswordMissingTokenBody:
      'This reset link is missing information. Request a new one from the forgot password screen.',
    requestNewLinkAction: 'Request a new link',

    // Verify email — src/app/(auth)/verify-email.tsx. Reached the same way
    // reset-password.tsx is: an emailed link deep-links back into the app.
    // Unlike reset-password, this screen never makes its own API call — the
    // verification itself already happened server-side on the request the
    // email client's browser/webview followed to get here (see
    // server/src/auth.ts's own comment on why autoSignInAfterVerification is
    // off) — this screen just reports what already happened and points the
    // user at sign-in.
    verifyEmailSuccessHeading: 'Email verified',
    verifyEmailSuccessBody: 'Your email is verified. You can now sign in.',
    verifyEmailErrorHeading: "This link isn't working",
    verifyEmailErrorBody: 'This verification link is invalid or has expired. Request a new one.',
    verifyEmailGoToSignIn: 'Go to sign in',

    // Shared field labels/placeholders/validation errors, used across more
    // than one of the four screens above.
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    requiredEmailError: 'Enter your email.',
    invalidEmailError: 'Enter a valid email address.',
    requiredPasswordError: 'Enter your password.',
    requiredNameError: 'Enter your name.',
    nameTooLongError: 'Use 80 characters or fewer.',
    passwordTooShortError: 'Password must be at least {minLength} characters.',
    passwordTooLongError: 'Password must be {maxLength} characters or fewer.',
    passwordMismatchError: "Passwords don't match.",
    // Distinct from copy.global.genericErrorBody, which explicitly mentions
    // "Your saved bills are still on this device" — not applicable before a
    // session even exists.
    genericAuthError: 'Something went wrong. Try again.',
    networkError: "We couldn't reach Splitsy. Check your connection and try again.",

    // Session gating — src/app/_layout.tsx. Shown when authClient.useSession()
    // itself fails (e.g. the auth backend is unreachable) — distinct from
    // backendNotConfigured below, which is a build-time misconfiguration, not
    // a runtime/network failure.
    sessionCheckFailedHeading: "Can't check your sign-in status",
    sessionCheckFailedBody:
      "We couldn't reach Splitsy's sign-in server. Check your connection and try again.",

    // Missing EXPO_PUBLIC_AUTH_BACKEND_URL — src/app/_layout.tsx. Unlike OCR's
    // backend URL, there is no fallback for auth (2026-08-25 spec Amendment),
    // so this is a hard, visible startup error rather than a silent skip.
    backendNotConfiguredHeading: 'Splitsy is not set up yet',
    backendNotConfiguredBody:
      'This build is missing its sign-in server address (EXPO_PUBLIC_AUTH_BACKEND_URL). Contact the developer or check the project setup.',

    // Log out — src/app/settings.tsx
    accountSection: 'Account',
    logOutAction: 'Log out',
    logOutFailure: "We couldn't log you out. Check your connection and try again.",
  },

  // Section 14 — global
  global: {
    genericErrorHeading: 'Something went wrong',
    genericErrorBody: 'Try again. Your saved bills are still on this device.',
    retryAction: 'Try again',
    cancelAction: 'Cancel',
    closeAccessibilityLabel: 'Close',
    loadingBills: 'Loading bills…',
    // _layout.tsx's migration gate, shown before any screen can render. Worth
    // its own message (not a bare spinner) specifically because of web: the
    // first visit there also means fetching + compiling a ~1MB SQLite WASM
    // binary (see WEB_PORT_STATUS.md's optimization pass), a genuinely
    // noticeable one-time cost with nothing to show for it on screen yet —
    // native's own synchronous db open is fast enough that this message
    // barely has time to appear, so showing it there too is harmless.
    settingUpDatabase: 'Setting up your database…',
    databaseStartupFailure: "Splitsy couldn't open its local data. Restart the app and try again.",
    imageCopyFailure:
      "We couldn't save this receipt image. Choose it again or enter the bill manually.",
    unsupportedImage: "This image couldn't be opened. Choose a different photo.",
    ocrUnavailable:
      "Receipt scanning isn't available on this device right now. You can still enter the bill manually.",
    storageFailure: "We couldn't save your changes. Check your available storage and try again.",
    deleteFailure: "We couldn't delete this bill. Try again.",
    // Web-only fallback (src/lib/share.web.ts): shown wherever a screen's own
    // Share action fell back to copying to the clipboard instead, on a
    // browser with no native share sheet of its own (most desktop browsers).
    sharedTextCopiedToast: 'Copied — paste it anywhere.',
  },
};

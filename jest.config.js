module.exports = {
  preset: 'jest-expo',
  // server/ is a separate Node package with its own runner (Vitest) — Jest's
  // default discovery would otherwise pick up its .test.ts files too.
  // .claude/worktrees/ holds full repo copies (ticket tooling / `git worktree`);
  // their suites belong to their own checkout, and indexing them would run
  // duplicates and trigger haste module-name collisions.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/', '<rootDir>/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  // ThemeProvider persists the light/dark override via AsyncStorage; its
  // native module isn't available under Jest, so every test run (even ones
  // that never touch theming directly, like AmountInput.test.ts importing
  // AppTextInput -> ThemeProvider transitively) needs the package's own
  // official mock in place.
  setupFiles: ['./jest.setup.js'],
};

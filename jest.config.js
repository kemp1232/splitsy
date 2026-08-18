module.exports = {
  preset: 'jest-expo',
  // server/ is a separate Node package with its own runner (Vitest) — Jest's
  // default discovery would otherwise pick up its .test.ts files too.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/'],
  // ThemeProvider persists the light/dark override via AsyncStorage; its
  // native module isn't available under Jest, so every test run (even ones
  // that never touch theming directly, like AmountInput.test.ts importing
  // AppTextInput -> ThemeProvider transitively) needs the package's own
  // official mock in place.
  setupFiles: ['./jest.setup.js'],
};

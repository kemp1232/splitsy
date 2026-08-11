module.exports = {
  preset: 'jest-expo',
  // server/ is a separate Node package with its own runner (Vitest) — Jest's
  // default discovery would otherwise pick up its .test.ts files too.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/'],
};

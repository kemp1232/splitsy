// AsyncStorage has no native module under Jest — use the package's own
// official mock (see jest.config.js's comment on why this is a global setup
// file rather than something scoped to just ThemeProvider's own tests).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
